"""Tennis singles forecast: who wins, by what set score, and how that moves with the live score.

Player strength is an Elo rating (overall and per surface) walked through every recorded
ATP/WTA match since 2020, tour level and below. A point-by-point model of serve games,
tiebreaks and sets is then tuned so its match win chance equals the rating's, which gives
set-score chances before the match and an updated win chance from any live set score.
Reasons are built from the model's own inputs. Pure local computation.
"""
import csv
import json
import math
from collections import defaultdict
from datetime import date
from functools import lru_cache

from .live import name_key

FOLDER = "data/raw/tennis_tour"
LOCAL_RESULTS = "data/local/tennis_results"
ROUNDS = {"Q1": 0, "Q2": 1, "Q3": 2, "Q4": 2, "RR": 3, "R128": 3, "R64": 4, "R32": 5, "R16": 6, "QF": 7, "SF": 8, "BR": 9, "F": 10}
SURFACE_WEIGHT = 0.35        # share of the surface rating in the blended rating (chosen by backtest)
SERVE_AVERAGE = {"atp": 0.635, "wta": 0.565}      # points won on serve, tour-wide
START = 1500.0
SLAMS = ("australian open", "roland garros", "french open", "wimbledon", "us open")
GENERIC = {"open", "masters", "ch", "international", "championships", "championship", "cup", "classic", "trophy", "atp", "wta", "125", "250", "500", "1000"}


def _number(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


class Player:
    __slots__ = ("name", "elo", "surface", "played", "surface_played", "serve", "ret", "recent", "rank", "rank_day", "last_day")

    def __init__(self, name):
        self.name, self.elo, self.surface, self.played, self.surface_played = name, START, {}, 0, defaultdict(int)
        self.serve, self.ret, self.recent = [0.0, 0.0], [0.0, 0.0], []      # decayed [points won, points played]
        self.rank = self.rank_day = self.last_day = None

    def rating(self, surface):
        return (1 - SURFACE_WEIGHT) * self.elo + SURFACE_WEIGHT * self.surface.get(surface, self.elo)


class Ratings:
    """State after walking every match before a cutoff day."""

    def __init__(self, tour):
        self.tour, self.players, self.h2h, self.events = tour, {}, defaultdict(list), {}
        self.matches = self.last_day = 0
        self.by_name = {}
        self.alias_ids = defaultdict(set)

    def expected(self, a, b, surface):
        return 1 / (1 + 10 ** ((b.rating(surface) - a.rating(surface)) / 400))

    def add(self, row):
        winner, loser = (self.players.setdefault(row[f"{k}_id"], Player(row[f"{k}_name"])) for k in ("winner", "loser"))
        surface, day = row["surface"] or "Hard", row["day"]
        self.events[name_key(row["tourney_name"])] = (surface, row["tourney_name"], day)
        for player, side in ((winner, "winner"), (loser, "loser")):
            if source_name := row.get(f"{side}_source_name"):
                self.alias_ids[name_key(source_name)].add(row[f"{side}_id"])
            rank = _number(row.get(f"{side}_rank"))
            if rank:
                player.rank, player.rank_day = int(rank), day
        if "W/O" in row["score"].upper() or not row["score"].strip():
            return
        for elo_of, set_elo, count in ((lambda p: p.elo, lambda p, v: setattr(p, "elo", v), lambda p: p.played),
                                       (lambda p: p.surface.get(surface, p.elo), lambda p, v: p.surface.__setitem__(surface, v), lambda p: p.surface_played[surface])):
            rw, rl = elo_of(winner), elo_of(loser)
            miss = 1 - 1 / (1 + 10 ** ((rl - rw) / 400))
            set_elo(winner, rw + 250 / (count(winner) + 5) ** 0.4 * miss)
            set_elo(loser, rl - 250 / (count(loser) + 5) ** 0.4 * miss)
        serve = {side: (_number(row.get(f"{side[0]}_svpt")), _number(row.get(f"{side[0]}_1stWon")), _number(row.get(f"{side[0]}_2ndWon"))) for side in ("winner", "loser")}
        if all(v is not None and serve[s][0] for s in serve for v in serve[s]):
            for player, mine, theirs in ((winner, serve["winner"], serve["loser"]), (loser, serve["loser"], serve["winner"])):
                player.serve = [0.97 * player.serve[0] + mine[1] + mine[2], 0.97 * player.serve[1] + mine[0]]
                player.ret = [0.97 * player.ret[0] + theirs[0] - theirs[1] - theirs[2], 0.97 * player.ret[1] + theirs[0]]
        for player, other, won in ((winner, loser, True), (loser, winner, False)):
            player.played += 1
            player.surface_played[surface] += 1
            player.last_day = day
            player.recent = (player.recent + [{"day": day, "won": won, "opponent": other.name, "score": row["score"], "event": row["tourney_name"],
                                               "surface": surface, "round": row["round"]}])[-40:]
        self.h2h[frozenset((row["winner_id"], row["loser_id"]))].append({"day": day, "winner": row["winner_id"], "score": row["score"],
                                                                         "event": row["tourney_name"], "surface": surface})
        self.matches, self.last_day = self.matches + 1, max(self.last_day, day)

    def index(self):
        """Name lookup, preferring whoever played most recently when names collide."""
        self.by_name = {}
        for pid, player in sorted(self.players.items(), key=lambda item: item[1].last_day or 0):
            self.by_name[name_key(player.name)] = pid
        for alias, ids in self.alias_ids.items():
            if len(ids) == 1:
                self.by_name.setdefault(alias, next(iter(ids)))

    def find(self, name):
        key = name_key(name)
        if key in self.by_name:
            return self.by_name[key]
        tokens = key.split()
        if len(tokens) < 2:
            return None
        recent = self.last_day - 730
        hits = [pid for other, pid in self.by_name.items() if (self.players[pid].last_day or 0) >= recent
                and other.split()[-1] == tokens[-1] and other[0] == tokens[0][0]]
        if len(hits) != 1:      # e.g. "Sara Alejandra Lozano Avellaneda" recorded with two surnames
            hits = [pid for other, pid in self.by_name.items() if (self.players[pid].last_day or 0) >= recent
                    and other.split()[0] == tokens[0] and set(other.split()[1:]) & set(tokens[1:])]
        return hits[0] if len(hits) == 1 else None

    def rank_rating(self, rank):
        """Typical blended rating of players near a ranking, for players missing from the archive."""
        near = sorted(p.elo for p in self.players.values() if p.rank and p.rank_day and p.rank_day >= self.last_day - 60
                      and 0.7 * rank <= p.rank <= 1.4 * rank + 1)
        return near[len(near) // 2] if near else None


def result_files(root, tour):
    folders = (root / FOLDER / tour, root / LOCAL_RESULTS / tour)
    return [path for folder in folders for path in sorted(folder.glob("*.csv"))]


def read_rows(root, tour):
    rows = []
    for path in result_files(root, tour):
        with path.open(encoding="utf-8", newline="") as file:
            for row in csv.DictReader(file):
                stamp = row.get("match_date") or row.get("tourney_date") or ""
                if len(stamp) != 8 or not stamp.isdecimal() or not row.get("winner_id") or not row.get("loser_id"):
                    continue
                row["day"] = date(int(stamp[:4]), int(stamp[4:6]), int(stamp[6:])).toordinal()
                row["main"] = "qual" not in path.name
                rows.append(row)
    rows.sort(key=lambda r: (r["day"], r["tourney_id"], ROUNDS.get(r["round"], 5), _number(r.get("match_num")) or 0))
    return rows


@lru_cache(maxsize=2)
def _fitted(root, tour, stamp):
    ratings = Ratings(tour)
    for row in read_rows(root, tour):
        ratings.add(row)
    ratings.index()
    return ratings


def ratings(root, tour):
    files = result_files(root, tour)
    if not files:
        raise ValueError("Tennis results are not downloaded yet. Run: python tools/fetch_tennis_archive.py")
    return _fitted(root, tour, tuple((f, f.stat().st_mtime_ns) for f in files))


# ---- point-by-point model ---------------------------------------------------------------
def game(p):
    """Chance the server holds, winning each point with chance p."""
    q = 1 - p
    return p ** 4 * (1 + 4 * q + 10 * q * q) + 20 * p ** 3 * q ** 3 * p * p / (1 - 2 * p * q)


@lru_cache(maxsize=4096)
def tiebreak(pa, pb, a=0, b=0):
    """Chance A wins a first-to-seven tiebreak from a-b. Serve order: A, B B, A A, ..."""
    if a >= 7 and a - b >= 2:
        return 1.0
    if b >= 7 and b - a >= 2:
        return 0.0
    if a >= 6 and b >= 6:        # from 6-6 it is win-by-two over a pair of points, one on each serve
        both, neither = pa * (1 - pb), (1 - pa) * pb
        level = both / (both + neither)
        if a == b:
            return level
        win = pa if (a + b) % 4 in (0, 3) else 1 - pb
        return win + (1 - win) * level if a > b else win * level
    win = pa if (a + b) % 4 in (0, 3) else 1 - pb
    return win * tiebreak(pa, pb, a + 1, b) + (1 - win) * tiebreak(pa, pb, a, b + 1)


@lru_cache(maxsize=8192)
def set_chance(pa, pb, a=0, b=0, a_serves=True):
    """Chance A wins the set from a-b games with A (or B) serving the next game."""
    if (a >= 6 and a - b >= 2) or a == 7:
        return 1.0
    if (b >= 6 and b - a >= 2) or b == 7:
        return 0.0
    if a == 6 and b == 6:
        return tiebreak(pa, pb) if a_serves else 1 - tiebreak(pb, pa)
    win = game(pa) if a_serves else 1 - game(pb)
    return win * set_chance(pa, pb, a + 1, b, not a_serves) + (1 - win) * set_chance(pa, pb, a, b + 1, not a_serves)


def set_from(pa, pb, a=0, b=0):
    """The feed does not say who is serving, so both cases are averaged."""
    return 0.5 * (set_chance(pa, pb, a, b, True) + set_chance(pa, pb, a, b, False))


def games_in_set(pa, pb):
    """Expected games in a full set (a tiebreak counts as one game)."""
    total = 0.0
    for first in (True, False):
        states = {(0, 0, first): 1.0}
        while states:
            (a, b, serves), chance = states.popitem()
            if (max(a, b) >= 6 and abs(a - b) >= 2) or 7 in (a, b):
                total += 0.5 * chance * (a + b)
                continue
            if a == 6 and b == 6:
                total += 0.5 * chance * 13
                continue
            win = game(pa) if serves else 1 - game(pb)
            for key, part in (((a + 1, b, not serves), win), ((a, b + 1, not serves), 1 - win)):
                states[key] = states.get(key, 0.0) + chance * part
    return total


def match_outcomes(set_win, need, won_a=0, won_b=0, current=None):
    """{(sets A, sets B): chance} of final set scores. current: A's chance in the set in progress."""
    final, states = defaultdict(float), {(won_a, won_b, True): 1.0}
    while states:
        (a, b, first), chance = states.popitem()
        if a == need or b == need:
            final[(a, b)] += chance
            continue
        p = current if first and current is not None else set_win
        for key, part in (((a + 1, b, False), p), ((a, b + 1, False), 1 - p)):
            states[key] = states.get(key, 0.0) + chance * part
    return dict(final)


def serve_points(target, total, need):
    """Serve-point chances (A, B) whose match win chance equals target, keeping A + B = total."""
    low, high = -0.3, 0.3
    for _ in range(40):
        gap = (low + high) / 2
        pa, pb = min(0.95, max(0.3, total / 2 + gap)), min(0.95, max(0.3, total / 2 - gap))
        won = sum(c for (a, _), c in match_outcomes(set_from(pa, pb), need).items() if a == need)
        low, high = (gap, high) if won < target else (low, gap)
    return round(pa, 4), round(pb, 4)


# ---- forecast ---------------------------------------------------------------------------
def _when(day):
    return date.fromordinal(day).strftime("%d %b %Y").lstrip("0")


def _own(name):
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def _surface(table, tournament):
    tokens = set(name_key(tournament).split())
    best = None
    for key, (surface, label, day) in table.events.items():
        words = set(key.split()) - GENERIC
        if words and words <= tokens and (best is None or len(words) > best[0] or (len(words) == best[0] and day > best[3])):
            best = (len(words), surface, label, day)
    if best:
        return best[1], f"{best[1]} court, as recorded for {best[2]} ({date.fromordinal(best[3]).year})."
    return "Hard", "This event is not in the results archive, so a hard court is assumed."


def _side(table, name, surface, rank_now):
    pid = table.find(name)
    tour_serve = SERVE_AVERAGE[table.tour]
    if pid is None:
        fallback = table.rank_rating(rank_now) if rank_now else None
        reasons = [f"{name} is not in the results archive." + (f" Rated as a typical world No. {rank_now} instead." if fallback else " Treated as an average player, so this forecast is weak.")]
        return {"name": name, "found": False, "rating": fallback or START, "overall": None, "surface_rating": None, "matches": 0, "rank": rank_now,
                "serve": tour_serve, "ret": 1 - tour_serve, "reasons": reasons, "recent": [], "pid": None, "last_day": None}
    p = table.players[pid]
    serve = (p.serve[0] + 300 * tour_serve) / (p.serve[1] + 300)
    ret = (p.ret[0] + 300 * (1 - tour_serve)) / (p.ret[1] + 300)
    on_surface = [m for m in p.recent if m["surface"] == surface and m["day"] >= table.last_day - 365]
    last10 = p.recent[-10:]
    reasons = [f"Rating {p.elo:.0f} overall and {p.surface.get(surface, p.elo):.0f} on {surface.lower()} courts, from {p.played} recorded matches ({p.surface_played[surface]} on {surface.lower()})."]
    rank = rank_now or p.rank
    if rank:
        reasons.append(f"World No. {rank}" + (" in today's draw sheet." if rank_now else f" when last recorded ({_when(p.rank_day)})."))
    if last10:
        latest = last10[-1]
        reasons.append(f"Last {len(last10)} recorded matches: {sum(m['won'] for m in last10)} won, {sum(not m['won'] for m in last10)} lost. "
                       f"Most recent: {'beat' if latest['won'] else 'lost to'} {latest['opponent']} {latest['score']} at {latest['event']} (week of {_when(latest['day'])}).")
    if on_surface:
        reasons.append(f"On {surface.lower()} courts in the last recorded year: {sum(m['won'] for m in on_surface)} won, {sum(not m['won'] for m in on_surface)} lost.")
    if p.serve[1] > 200:
        reasons.append(f"Wins {100 * serve:.0f}% of points on serve and {100 * ret:.0f}% on return in recent matches (tour average {100 * tour_serve:.0f}% and {100 * (1 - tour_serve):.0f}%).")
    if p.played < 15:
        reasons.append("Fewer than 15 matches on record, so this rating is still rough.")
    return {"name": name, "found": True, "rating": p.rating(surface), "overall": round(p.elo), "surface_rating": round(p.surface.get(surface, p.elo)),
            "matches": p.played, "rank": rank, "serve": serve, "ret": ret, "reasons": reasons, "pid": pid, "last_day": p.last_day,
            "recent": [{"date": str(date.fromordinal(m["day"])), "won": m["won"], "opponent": m["opponent"], "score": m["score"], "event": m["event"], "surface": m["surface"]}
                       for m in reversed(p.recent[-6:])]}


def _live_state(intel, need):
    """Sets won and games in the set being played, from the feed's set scores."""
    sets = [s for s in (intel or {}).get("sets") or [] if isinstance(s.get("a"), int) and isinstance(s.get("b"), int)]
    won, current = [0, 0], (0, 0)
    for index, one in enumerate(sets):
        a, b = one["a"], one["b"]
        finished = one.get("done") or index < len(sets) - 1 or (max(a, b) >= 6 and abs(a - b) >= 2) or max(a, b) == 7
        if finished and a != b:
            won[0 if a > b else 1] += 1
        elif not finished:
            current = (min(a, 6), min(b, 6))
    if max(won) >= need:
        return None
    return {"sets": won, "games": current, "text": ", ".join(f"{s['a']}-{s['b']}" for s in sets) or "0-0"}


def build(root, fixture, intel=None):
    tour = "wta" if str(fixture.get("tournament", "")).upper().startswith("WTA") else "atp"
    table = ratings(root, tour)
    names = [fixture["team"], fixture["opponent"]]
    listed = [name_key(n) for n in (intel or {}).get("names") or []]
    if len(listed) == 2 and listed[0] == name_key(names[1]) and listed[1] == name_key(names[0]):      # feed lists the sides the other way round
        intel = {**intel, "sets": [{**one, "a": one["b"], "b": one["a"]} for one in intel.get("sets") or []],
                 "winner": None if intel.get("winner") is None else 1 - intel["winner"], "names": names}
    if any(not name or name_key(name) in ("tbd", "bye") for name in names):
        return {"supported": False, "reason": "The players for this match are not decided yet."}
    event = str(fixture.get("tournament", "")).partition("·")[2].strip() or str(fixture.get("tournament", ""))
    surface, surface_note = _surface(table, event)
    qualifying = "qualif" in str(fixture.get("detail", "")).lower()
    need = 3 if tour == "atp" and not qualifying and any(s in name_key(event) for s in SLAMS) else 2
    ranks = [None, None]
    sides = [_side(table, name, surface, ranks[i] if i < len(ranks) else None) for i, name in enumerate(names)]
    rated = 1 / (1 + 10 ** ((sides[1]["rating"] - sides[0]["rating"]) / 400))
    total = (sides[0]["serve"] + 1 - sides[1]["ret"]) / 2 + (sides[1]["serve"] + 1 - sides[0]["ret"]) / 2
    best_of_three = serve_points(rated, total, 2)       # ratings are learned almost entirely from best-of-three
    pa, pb = best_of_three
    set_win = set_from(pa, pb)
    outcomes = match_outcomes(set_win, need)
    win = sum(c for (a, _), c in outcomes.items() if a == need)
    expected_sets = sum((a + b) * c for (a, b), c in outcomes.items())

    meetings = table.h2h.get(frozenset((sides[0]["pid"], sides[1]["pid"])), []) if all(s["pid"] for s in sides) else []
    first_wins = sum(m["winner"] == sides[0]["pid"] for m in meetings)
    h2h = {"meetings": len(meetings), "wins": [first_wins, len(meetings) - first_wins],
           "last": [{"date": str(date.fromordinal(m["day"])), "winner": names[0] if m["winner"] == sides[0]["pid"] else names[1],
                     "score": m["score"], "event": m["event"], "surface": m["surface"]} for m in reversed(meetings[-4:])]}
    gap = round(sides[0]["rating"] - sides[1]["rating"])
    stale = (date.today().toordinal() - table.last_day)
    notes = [f"{names[0] if gap >= 0 else names[1]} is rated {abs(gap)} points higher on {surface.lower()} courts, which is worth a {100 * max(rated, 1 - rated):.0f}% win chance."]
    notes.append(f"They have met {len(meetings)} time{'s' if len(meetings) != 1 else ''} on record: {names[0]} {first_wins}, {names[1]} {len(meetings) - first_wins}." if meetings
                 else "No earlier meeting between them is on record since 2020.")
    if need == 3:
        notes.append("Best of five sets: the longer format favours the stronger player a little more.")
    if stale > 21:
        notes.append(f"The results archive ends in the week of {_when(table.last_day)}. Matches played since then are not in the ratings, so recent form may be missing.")

    teams = []
    for i, side in enumerate(sides):
        p = win if i == 0 else 1 - win
        teams.append({"name": side["name"], "win": round(p, 3), "found": side["found"], "rank": side["rank"], "lineup_confirmed": True,
                      "rating": {"overall": side["overall"], "surface": side["surface_rating"], "blended": round(side["rating"]), "matches": side["matches"]},
                      "serve_points_won": round(pa if i == 0 else pb, 3), "hold": round(game(pa if i == 0 else pb), 3),
                      "first_set": round(set_win if i == 0 else 1 - set_win, 3), "reasons": side["reasons"], "recent": side["recent"],
                      "last_played": str(date.fromordinal(side["last_day"])) if side["last_day"] else None})
    state = (intel or {}).get("state") or fixture.get("state") or "pre"
    payload = {
        "supported": True, "sport": "tennis", "tour": tour.upper(), "format": f"Best of {2 * need - 1}", "stage": "pre", "teams": teams,
        "surface": {"name": surface, "note": surface_note}, "notes": notes, "h2h": h2h,
        "set_scores": sorted(({"score": f"{a}-{b}", "winner": names[0] if a > b else names[1], "chance": round(c, 3)} for (a, b), c in outcomes.items()),
                             key=lambda row: -row["chance"]),
        "deciding_set": round(sum(c for (a, b), c in outcomes.items() if a + b == 2 * need - 1), 3),
        "expected_games": round(expected_sets * games_in_set(pa, pb), 1),
        "intel": {"available": bool((intel or {}).get("ok")), "fetched_at": (intel or {}).get("fetched_at"), "state": state,
                  "status": (intel or {}).get("status") or fixture.get("status")},
        "analysis": {
            "data": f"{table.matches:,} {tour.upper()} singles matches since 2020 (tour level, qualifying and the level below), through the week of {_when(table.last_day)}.",
            "machine_learning": {"used": True, "name": "Surface-aware Elo ratings + point-by-point set model",
                                 "detail": "Ratings are updated after every recorded match. The set model plays out serve games and tiebreaks so the forecast can follow the live score."},
            "deep_learning": {"used": False, "detail": "Not used. Nothing more complex has beaten these ratings in a held-out test here."},
            "backtest": backtest(root, tour),
        },
    }
    live = _live_state(intel, need) if state == "in" else None
    if live:
        current = set_from(pa, pb, *live["games"])
        now = match_outcomes(set_win, need, live["sets"][0], live["sets"][1], current)
        win_now = sum(c for (a, _), c in now.items() if a == need)
        leader = 0 if win_now >= 0.5 else 1
        set_number = sum(live["sets"]) + 1
        changes = [f"Score: {live['text']} (sets {live['sets'][0]}-{live['sets'][1]}).",
                   f"{_own(names[0])} win chance is {100 * win_now:.0f}% now; it was {100 * win:.0f}% before the match ({100 * (win_now - win):+.0f} points).",
                   f"{names[0]} wins the set in progress {100 * current:.0f}% of the time from {live['games'][0]}-{live['games'][1]}.",
                   "The feed does not show the server or the point score, so the number moves at the end of each game."]
        payload["live"] = {"score": live["text"], "sets": live["sets"], "games": list(live["games"]), "set_number": set_number,
                           "win": [round(win_now, 3), round(1 - win_now, 3)], "leader": names[leader], "current_set": round(current, 3),
                           "position": [live["sets"][0], live["sets"][1], live["games"][0], live["games"][1]],
                           "checkpoint": f"live-set{set_number}-{'late' if sum(live['games']) >= 6 else 'early'}",
                           "set_scores": sorted(({"score": f"{a}-{b}", "winner": names[0] if a > b else names[1], "chance": round(c, 3)} for (a, b), c in now.items()),
                                                key=lambda row: -row["chance"]),
                           "changes": changes}
    return payload


def ai_context(forecast):
    live = forecast.get("live")
    context = {
        "sport": "tennis", "fixture": forecast["fixture"], "format": forecast["format"], "surface": forecast["surface"], "notes": forecast["notes"],
        "head_to_head": forecast["h2h"], "set_score_chances": forecast["set_scores"], "expected_games": forecast["expected_games"],
        "sides": [{"name": t["name"], "model_win_chance": t["win"], "rank": t["rank"], "rating": t["rating"], "hold_serve_chance": t["hold"],
                   "reasons": t["reasons"], "recent_matches": t["recent"][:5]} for t in forecast["teams"]],
        "model_already_uses": ["player ratings overall and on this surface", "serve and return points won", "sets and games won so far in this match"],
        "model_does_not_use": ["results after the archive's last week", "fatigue, injury or medical time-outs", "who is serving and the point score",
                               "momentum inside this match", "indoor or outdoor conditions and weather", "style match-ups"],
    }
    if live:
        context["live"] = {k: live[k] for k in ("score", "sets", "games", "current_set", "changes")}
        context["live"]["model_win_chance_now"] = dict(zip((t["name"] for t in forecast["teams"]), live["win"]))
    return context


def backtest(root, tour):
    try:
        return json.loads((root / "artifacts/tennis-backtest.json").read_text(encoding="utf-8"))[tour]
    except (OSError, ValueError, KeyError):
        return None
