"""Offline, reproducible conversion of retained public datasets. No invented results."""
import csv
import hashlib
import io
import json
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from matchlab.cricket_archive import CRICKET_TEAMS
from matchlab.tennis_forecast import LOCAL_RESULTS, result_files

RAW = ROOT / "data/raw"
OUT = ROOT / "data/real"
MATCH = ["match_id", "date", "team", "opponent", "team_score", "opponent_score", "outcome", "venue", "pre_match_date", "competition"]
PLAYER = ["match_id", "player", "team", "score"]
INTERACTION = ["match_id", "player", "opponent_player", "opportunities", "successes", "score"]


def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def result(a, b):
    return "team" if a > b else "opponent" if a < b else "draw"


def match(mid, day, a, b, sa, sb, venue="neutral", pre=None, competition=""):
    return dict(zip(MATCH, [mid, day, a, b, sa, sb, result(sa, sb), venue, pre or day, competition]))


def save(sport, matches, players, interactions, provenance, extra=(), extra_players=()):
    """extra: optional descriptive match columns (ground, surface, ...). They are
    blank where the source has no value and are never required by the loader."""
    folder = OUT / sport
    folder.mkdir(parents=True, exist_ok=True)
    if extra:
        provenance["match_context_columns"] = list(extra)
    for name, fields, records in [("matches", MATCH + list(extra), matches), ("players", PLAYER + list(extra_players), players), ("interactions", INTERACTION, interactions)]:
        with (folder / f"{name}.csv").open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, restval="")
            w.writeheader()
            w.writerows(records)
    provenance.update(sport=sport, matches=len(matches), player_rows=len(players), interaction_rows=len(interactions),
                      earliest=min(m["date"] for m in matches), latest=max(m["date"] for m in matches), synthetic=False,
                      files={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.glob("*.csv")})
    (folder / "provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    print(f"{sport}: {len(matches)} real matches, {len(players)} appearances, {len(interactions)} interactions")


def football():
    ms = []
    for p in sorted((RAW / "football").glob("*.json")):
        data = json.loads(p.read_text())
        for i, r in enumerate(data["matches"]):
            scores = r.get("score", {}).get("ft")
            if scores and all(isinstance(s, int) for s in scores):
                ms.append(match(f"epl-{p.stem}-{i}", r["date"], r["team1"], r["team2"], *scores, "home", competition="EPL"))
    save("football", ms, [], [], dict(source="OpenFootball football.json; English Premier League 2021–2024", url="https://github.com/openfootball/football.json", license="CC0-1.0", limitations=["Full-time league results only. No player appearances or interactions.", "Historical snapshot ends May 2024; no current injuries, lineups, transfers or fixtures."]))


# Same physical ground under an earlier or longer name.
CRICKET_GROUNDS = {"Feroz Shah Kotla": "Arun Jaitley Stadium", "Sardar Patel Stadium": "Narendra Modi Stadium",
                   "Punjab Cricket Association Stadium": "Punjab Cricket Association IS Bindra Stadium",
                   "Subrata Roy Sahara Stadium": "Maharashtra Cricket Association Stadium"}
CRICKET_CITIES = {"Bangalore": "Bengaluru"}
CRICKET_EXTRA = ["ground", "city", "toss_winner", "toss_decision", "season", "batting_first"]


def cricket():
    ms, ps, xs = [], [], []
    skipped = Counter()
    def canonical(side):
        return CRICKET_TEAMS.get(side, side)
    def ground_name(raw):
        base = (raw or "").split(",")[0].strip()
        return CRICKET_GROUNDS.get(base, base)
    with zipfile.ZipFile(RAW / "cricket/ipl_json.zip") as z:
        for name in z.namelist():
            if not name.endswith(".json"):
                continue
            r = json.loads(z.read(name))
            info = r["info"]
            day = str(info["dates"][0])
            innings = r.get("innings", [])
            if len(innings) != 2 or any(i.get("super_over") for i in innings) or info["outcome"].get("method") or info.get("overs") != 20 or not info["outcome"].get("winner"):
                skipped["nonstandard/no-result/DLS/super-over"] += 1
                continue
            a, b = map(canonical, info["teams"])
            scores, player_runs, pair = {}, Counter(), defaultdict(lambda: [0, 0, 0])
            replacements = defaultdict(list)
            for innings_row in innings:
                side = canonical(innings_row["team"])
                scores[side] = 0
                for over in innings_row["overs"]:
                    for ball in over["deliveries"]:
                        for replacement in ball.get("replacements", {}).get("match", []):
                            replacements[canonical(replacement.get("team", ""))].append(replacement)
                        scores[side] += ball["runs"]["total"]
                        player_runs[ball["batter"]] += ball["runs"]["batter"]
                        # Non-wide deliveries (including no-balls) are faced balls;
                        # only recorded batter fours/sixes count as boundaries.
                        if not ball.get("extras", {}).get("wides"):
                            q = pair[(ball["batter"], ball["bowler"])]
                            q[0] += 1
                            q[1] += int(ball["runs"]["batter"] in (4, 6) and not ball["runs"].get("non_boundary", False))
                            q[2] += ball["runs"]["batter"]
            if set(scores) != {a, b}:
                skipped["missing innings"] += 1
                continue
            mid = "ipl-" + Path(name).stem
            m = match(mid, day, a, b, scores[a], scores[b], competition="IPL T20")
            m["outcome"] = "team" if canonical(info["outcome"]["winner"]) == a else "opponent"
            toss = info.get("toss") or {}
            m.update(ground=ground_name(info.get("venue")), city=CRICKET_CITIES.get(info.get("city"), info.get("city") or ""),
                     toss_winner=canonical(toss.get("winner", "")), toss_decision=toss.get("decision", ""),
                     season=str(info.get("season", "")), batting_first=canonical(innings[0]["team"]))
            ms.append(m)
            for side, names in info["players"].items():
                roster = set(names)
                changes = replacements[canonical(side)]
                starters = roster - {r.get("in") for r in changes}
                known_xi = len(starters) == 11 and all(r.get("in") in roster and r.get("out") in roster for r in changes)
                for player in names:
                    # A listed match participant with no batting runs scored has
                    # zero runs in this match, including did-not-bat appearances.
                    ps.append(dict(zip(PLAYER, [mid, player, canonical(side), player_runs[player]]),
                                   starter=int(player in starters) if known_xi else ""))
            for (player, bowler), (opps, boundaries, runs) in pair.items():
                xs.append(dict(zip(INTERACTION, [mid, player, bowler, opps, boundaries, runs])))
    # One city label per ground: the source omits or varies it across seasons.
    latest_city = {}
    for m in sorted(ms, key=lambda r: r["date"]):
        if m["city"]:
            latest_city[m["ground"]] = m["city"]
    for m in ms:
        m["city"] = latest_city.get(m["ground"], "")
    years = sorted({m["date"][:4] for m in ms})
    save("cricket", ms, ps, xs, extra=CRICKET_EXTRA, extra_players=("starter",), provenance=dict(source=f"Cricsheet IPL JSON, {years[0]}–{years[-1]}; credit Cricsheet",
         normalizations={**{k: f"{v} (same franchise; historical records combined)" for k, v in CRICKET_TEAMS.items()},
                         **{k: f"{v} (same ground)" for k, v in CRICKET_GROUNDS.items()}}, url="https://cricsheet.org/", license="ODC-BY-1.0 (https://opendatacommons.org/licenses/by/1-0/)", excluded=dict(skipped),
         stage_1_inputs={"batting_first": "First innings team from the recorded innings order", "starter": "Eleven listed players after excluding recorded incoming match replacements; blank when the starting XI cannot be established"},
         limitations=["Completed standard IPL T20 matches only; DLS, no-result and super-over matches excluded.", "Player runs are per listed appearance, including did-not-bat zeroes; not conditional on batting position.", "Boundary threat is expected fraction of non-wide deliveries producing a batter four/six against a bowler; no-balls count, non-boundary overthrows do not.", "Chasing totals are truncated by reaching the target. Pre-match squad strength uses the last completed starting XI.", "Home advantage is inferred from earlier IPL seasons. Ground history describes completed matches; pitch conditions and weather are unmeasured."]))


TENNIS_EXTRA = ["ground", "surface", "level", "round", "team_rank", "opponent_rank", "team_rank_points", "opponent_rank_points"]


def tennis():
    ms, ps, xs = [], [], []
    supplemental_matches = 0
    supplement = ROOT / LOCAL_RESULTS / "atp"
    for path in result_files(ROOT, "atp"):
        is_supplement = path.parent == supplement
        if not re.fullmatch(r"atp_matches_20\d{2}(?:_supplement)?\.csv", path.name):
            continue
        for i, r in enumerate(rows(path)):
            # Homogeneous best-of-three singles. No retirements/walkovers.
            if r["best_of"] != "3" or not r.get("score") or re.search(r"[A-Za-z]", r["score"]):
                continue
            sets = re.findall(r"(\d+)-(\d+)(?:\(\d+\))?", r["score"])
            wa = sum(int(a) > int(b) for a, b in sets)
            lb = sum(int(a) < int(b) for a, b in sets)
            if wa != 2 or lb > 1:
                continue
            match_day = r.get("match_date") if is_supplement else None
            if is_supplement and not match_day:
                continue
            start = datetime.strptime(match_day or r["tourney_date"], "%Y%m%d").date()
            available = start if match_day else start + timedelta(days=14)
            w = f"{r['winner_name']} [{r['winner_id']}]"
            l = f"{r['loser_name']} [{r['loser_id']}]"
            a, b = sorted([w, l])
            mid = f"atp-{path.stem}-{i}"
            m = match(mid, available.isoformat(), a, b, wa if a == w else lb, lb if a == w else wa, pre=start.isoformat(), competition="ATP best-of-three")
            first, second = ("winner", "loser") if a == w else ("loser", "winner")
            # Use archive entry rankings. Supplemental sources record rankings as of the match.
            m.update(ground=r.get("tourney_name", ""), surface=r.get("surface", ""), level=r.get("tourney_level", ""), round=r.get("round", ""),
                     team_rank="" if is_supplement else r.get(first + "_rank", ""), opponent_rank="" if is_supplement else r.get(second + "_rank", ""),
                     team_rank_points="" if is_supplement else r.get(first + "_rank_points", ""), opponent_rank_points="" if is_supplement else r.get(second + "_rank_points", ""))
            ms.append(m)
            supplemental_matches += is_supplement
            for player, prefix in ((w, "w"), (l, "l")):
                if r.get(prefix + "_ace", ""):
                    ps.append(dict(zip(PLAYER, [mid, player, player, int(r[prefix + "_ace"])])))
            stats = [r.get(k, "") for k in ("w_svpt", "l_svpt", "w_1stWon", "w_2ndWon", "l_1stWon", "l_2ndWon")]
            if all(stats) and all(r.get(k, "") for k in ("w_ace", "l_ace")):
                ws, ls, w1, w2, l1, l2 = map(int, stats)
                total, won = ws + ls, w1 + w2 + ls - l1 - l2
                if total > 0 and 0 <= won <= total:
                    for player, other, points in ((w, l, won), (l, w, total - won)):
                        xs.append(dict(zip(INTERACTION, [mid, player, other, total, points, points])))
    years = sorted({m["pre_match_date"][:4] for m in ms})
    provenance = dict(
        source=f"Jeff Sackmann / Tennis Abstract, retained archive by Aneeshers; ATP {years[0]}–{years[-1]}",
        url="https://github.com/Aneeshers/tennis-sackmann-archive",
        license="CC BY-NC-SA 4.0 — noncommercial use",
        limitations=[
            "Only completed best-of-three ATP men's singles; no Grand Slam best-of-five or retirements.",
            "Archive rows use tournament start for pre_match_date and start +14 days for result availability. Supplement rows use the published match day for both. Features use only results available before the prediction day.",
            "Aces only where reported; missing aces omitted, never imputed as zero.",
            "Point threat: fraction of total match points won, derived from both players' serve points and serve points won. No shot-level context.",
            "Ground is the tournament name. Surface, level and round are included when published. Entry rankings and points are available on archive rows.",
        ],
    )
    if supplemental_matches:
        provenance["source"] += " + local supplemental match results"
        provenance["license"] += ". Supplemental data follows its sources' noncommercial terms."
        provenance["supplement"] = {"matches": supplemental_matches, "manifest": f"{LOCAL_RESULTS}/snapshot.json"}
    save("tennis", ms, ps, xs, extra=TENNIS_EXTRA, provenance=provenance)


def baseball():
    ms = []
    with zipfile.ZipFile(RAW / "baseball/gl2023.zip") as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".txt"))
        for i, r in enumerate(csv.reader(io.StringIO(z.read(name).decode("utf-8-sig")))):
            if r[13] or r[14] or int(r[9]) == int(r[10]):
                continue  # exclude suspended/forfeit/tie games
            day = datetime.strptime(r[0], "%Y%m%d").date().isoformat()
            ms.append(match(f"retro-2023-{i}", day, r[6], r[3], int(r[10]), int(r[9]), "home", competition="MLB 2023 regular season"))
    save("baseball", ms, [], [], dict(source="Retrosheet game logs, MLB 2023 regular season", url="https://www.retrosheet.org/", license="Retrosheet free reuse with mandatory attribution", attribution="The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.", limitations=["Team game logs only, no individual batting or pitcher interactions. Suspensions, forfeits and ties excluded.", "Team abbreviations are Retrosheet identifiers. Historical snapshot, no current lineups."]))


def rugby():
    ms = []
    for i, r in enumerate(rows(RAW / "rugby/results.csv")):
        try:
            day = datetime.strptime(r["Date"], "%a, %d %b %Y").date().isoformat()
            a, b = r["Match"].split(" v ")
            sa, sb = map(int, r["Score"].split("-"))
        except (ValueError, KeyError):
            continue
        if "2011-01-01" <= day < "2016-01-01":
            ms.append(match(f"superrugby-{i}", day, a, b, sa, sb, "home", competition="Super Rugby 2011–2015"))
    save("rugby", ms, [], [], dict(source="Thomas McMahon superrugby; original results collated by Kevin Lassen", url="https://github.com/thmcmahon/superrugby", license="CC0 (publisher DESCRIPTION)", limitations=["Super Rugby union only, 2011–2015. Historical team names retained; no rugby league, current form, players or carry interactions.", "Scores are final match points, including extra time in knockout fixtures. Draws are possible in league play."]))


def badminton_name_key(name):
    text = unicodedata.normalize("NFKD", name.casefold()).encode("ascii", "ignore").decode()
    return tuple(sorted(re.findall(r"[a-z0-9]+", text)))


def badminton_game(score):
    a, b = map(int, score.split("-"))
    hi, lo = max(a, b), min(a, b)
    if not (hi == 21 and 0 <= lo <= 19 or 22 <= hi <= 30 and hi - lo == 2 or (hi, lo) == (30, 29)):
        raise ValueError("Incomplete or invalid badminton game score")
    return a, b


def import_bwf(path, matches):
    aliases = defaultdict(set)
    for m in matches:
        for player in (m["team"], m["opponent"]):
            aliases[badminton_name_key(player)].add(player)
    def canonical(raw):
        parts = raw.split()
        known = aliases[badminton_name_key(raw)]
        if len(known) == 1:
            return next(iter(known))
        return " ".join([parts[-1].upper(), *(part.title() for part in parts[:-1])])

    def fixture(day, a, b):
        return day, *sorted((a.casefold(), b.casefold()))

    seen = {fixture(m["date"], m["team"], m["opponent"]): m for m in matches}
    added, skipped = [], Counter()
    for i, r in enumerate(rows(path), 1):
        if r["discipline"] != "MS" or r["retired"].lower() != "false" or r["winner"] not in ("1", "2"):
            skipped["retirement_or_other_discipline"] += 1
            continue
        try:
            day = datetime.strptime(r["date"], "%d-%m-%Y").date().isoformat()
            a, b = canonical(r["team_one_players"]), canonical(r["team_two_players"])
            games = [badminton_game(r[f"game_{g}_score"]) for g in range(1, 4) if r.get(f"game_{g}_score")]
            wins = sum(x > y for x, y in games)
            losses = len(games) - wins
            if a == b or (wins if r["winner"] == "1" else losses) != 2 or min(wins, losses) > 1:
                raise ValueError("Game scores and reported outcome disagree")
        except (ValueError, IndexError):
            skipped["missing_or_invalid_game_scores_or_names"] += 1
            continue
        context = dict(ground=r["tournament"], level=r["tournament_type"], round=r["round"])
        identity = fixture(day, a, b)
        if identity in seen:
            skipped["duplicate_date_and_players"] += 1
            seen[identity].update(context)
            continue
        if a > b:
            a, b, wins, losses = b, a, losses, wins
        m = match(f"bwf-ms-{i}", day, a, b, wins, losses, competition="BWF World Tour men's singles")
        m.update(context)
        added.append(m)
        seen[identity] = m
    return added, dict(skipped)


def badminton():
    ms, ps, xs = [], [], []
    # Men's singles only, a homogeneous subset of ShuttleSet. Names taken verbatim
    # from match.csv. Women's singles remain in the original retained annotations.
    women = {"An Se Young", "Mia BLICHFELDT", "Carolina MARIN", "Ratchanok INTANON", "TAI Tzu Ying", "PUSARLA V. Sindhu", "Nozomi OKUHARA", "Akane YAMAGUCHI", "Pornpawee CHOCHUWONG", "Evgeniya KOSETSKAYA", "HE Bingjiao", "CHEN Yufei", "WANG Zhi Yi", "Busanan ONGBAMRUNGPHAN", "Supanida KATETHONG"}
    candidates = [("badminton", r) for r in rows(RAW / "badminton/set/match.csv")]
    if (RAW / "badminton22/set/match.csv").exists():
        candidates += [("badminton22", r) for r in rows(RAW / "badminton22/set/match.csv")]
    seen = set()
    for source, r in candidates:
        if r["winner"] in women or r["loser"] in women:
            continue
        w, l = r["winner"], r["loser"]
        a, b = sorted([w, l])
        mid = ("shuttle-" if source == "badminton" else "shuttle22-") + r["id"]
        day = date(int(float(r["year"])), int(float(r["month"])), int(float(r["day"]))).isoformat()
        identity = (day, *sorted([a.casefold(), b.casefold()]))
        if identity in seen:
            continue
        seen.add(identity)
        ms.append(match(mid, day, a, b, 2 if a == w else int(r["set"]) - 2, int(r["set"]) - 2 if a == w else 2, competition="ShuttleSet men's singles"))
        points = Counter()
        games = Counter()
        complete = True
        for index in range(1, int(r["set"]) + 1):
            path = RAW / source / "set" / r["video"] / f"set{index}.csv"
            if not path.exists():
                complete = False
                break
            annotations = rows(path)
            # Some broadcast rallies are missing from stroke annotations. The
            # last row explicitly records the completed game scoreboard; use
            # those observed points rather than inventing missing rally events.
            last = annotations[-1]
            try:
                counts = Counter(A=int(last["roundscore_A"]), B=int(last["roundscore_B"]))
            except (KeyError, ValueError):
                complete = False
                break
            hi, lo = sorted([counts["A"], counts["B"]], reverse=True)
            winner_code = "A" if counts["A"] > counts["B"] else "B"
            if last.get("getpoint_player") != winner_code or not (hi >= 21 and ((hi - lo == 2 and hi <= 30) or (hi == 30 and lo == 29) or (hi == 21 and lo < 20))):
                complete = False
            games[winner_code] += 1
            points.update(counts)
        complete = complete and games["A"] == 2 and games["B"] == int(r["set"]) - 2
        if complete:
            for player, other, code in ((w, l, "A"), (l, w, "B")):
                ps.append(dict(zip(PLAYER, [mid, player, player, points[code]])))
                xs.append(dict(zip(INTERACTION, [mid, player, other, sum(points.values()), points[code], points[code]])))
    provenance = dict(source="ShuttleSet and ShuttleSet22, Wei-Yao Wang and collaborators (KDD 2023 / IJCAI 2023)",
                      url="https://github.com/wywyWang/CoachAI-Projects", license="MIT (copyright 2022 Wei-Yao Wang); annotations only",
                      limitations=["Local badminton results end in 2022. Current forecasts use historical player strength from that period.",
                                   "Player and rally models use the selected ShuttleSet annotations with verified terminal scoreboards."])
    bwf = RAW / "badminton_bwf/ms.csv"
    if bwf.is_file():
        added, skipped = import_bwf(bwf, ms)
        ms.extend(added)
        provenance["source"] += "; Badminton BWF World Tour, sanderp on Kaggle"
        provenance["license"] += "; BWF World Tour data and derived match data under CC BY-SA 4.0"
        provenance["attribution"] = "Badminton BWF World Tour by sanderp, https://www.kaggle.com/datasets/sanderp/badminton-bwf-world-tour (https://creativecommons.org/licenses/by-sa/4.0/). Names and orientation normalized, completed game scores converted to games won, and duplicate fixtures removed."
        provenance["bwf_import"] = dict(matches=len(added), excluded=skipped, sha256=hashlib.sha256(bwf.read_bytes()).hexdigest())
    else:
        print(f"badminton: {bwf} is absent; importing ShuttleSet only")
        provenance["limitations"].append("ShuttleSet-only sample is small and selected. Many players have insufficient history.")
    save("badminton", ms, ps, xs, provenance, extra=("ground", "level", "round") if bwf.is_file() else ())


if __name__ == "__main__":
    from import_f1 import ARCHIVE, import_f1

    importers = dict(football=football, cricket=cricket, tennis=tennis, badminton=badminton, baseball=baseball, rugby=rugby)
    chosen = sys.argv[1:] or [*importers, *(["f1"] if ARCHIVE.is_file() else [])]
    importers["f1"] = import_f1
    unknown = [name for name in chosen if name not in importers]
    if unknown:
        sys.exit("Unknown sport(s): " + ", ".join(unknown) + ". Choose from: " + ", ".join(importers))
    for name in chosen:
        importers[name]()
