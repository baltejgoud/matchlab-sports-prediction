import tempfile
import unittest
from datetime import date
from pathlib import Path

from matchlab import ai_check, tennis_forecast as tf, tracker

HEADER = ("tourney_id,tourney_name,surface,tourney_level,tourney_date,match_num,winner_id,winner_name,loser_id,loser_name,score,best_of,round,"
          "w_svpt,w_1stWon,w_2ndWon,l_svpt,l_1stWon,l_2ndWon,winner_rank,loser_rank")
FIXTURE = {"id": "tennis-1", "team": "Ann Strong", "opponent": "Bea Weak", "tournament": "WTA · Testville Open", "start": "2026-11-13T10:00:00Z", "detail": "Final"}


def archive(root):
    folder = root / tf.FOLDER / "wta"
    folder.mkdir(parents=True)
    rows = [HEADER]
    for week in range(30):       # Ann beats Bea and Cat every week; Bea beats Cat
        stamp = f"2025{1 + week // 4:02d}{1 + 7 * (week % 4):02d}"
        rows += [f"t{week},Testville,Hard,I,{stamp},1,1,Ann Strong,2,Bea Weak,6-3 6-4,3,F,60,30,12,60,22,10,5,40",
                 f"t{week},Testville,Hard,I,{stamp},2,1,Ann Strong,3,Cat Other,6-2 6-2,3,SF,60,30,12,60,22,10,5,80",
                 f"t{week},Testville,Hard,I,{stamp},3,2,Bea Weak,3,Cat Other,7-5 6-4,3,QF,60,28,11,60,24,10,40,80"]
    (folder / "wta_matches_2025.csv").write_text("\n".join(rows), encoding="utf-8")


class PointModel(unittest.TestCase):
    def test_equal_players_are_level_and_better_servers_hold_more(self):
        self.assertAlmostEqual(tf.set_from(0.62, 0.62), 0.5, places=6)
        self.assertAlmostEqual(tf.tiebreak(0.6, 0.6), 0.5, places=6)
        self.assertGreater(tf.game(0.7), tf.game(0.6))
        self.assertAlmostEqual(tf.game(0.5), 0.5, places=6)

    def test_serve_points_reproduce_the_target_win_chance(self):
        pa, pb = tf.serve_points(0.7, 1.26, 2)
        won = sum(c for (a, _), c in tf.match_outcomes(tf.set_from(pa, pb), 2).items() if a == 2)
        self.assertAlmostEqual(won, 0.7, places=2)
        self.assertAlmostEqual(sum(tf.match_outcomes(0.6, 3).values()), 1.0, places=9)


class Forecast(unittest.TestCase):
    def test_ratings_pick_up_the_local_supplement(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive(root)
            original = tf.ratings(root, "wta")
            supplemental = root / tf.LOCAL_RESULTS / "wta"
            supplemental.mkdir(parents=True)
            (supplemental / "wta_matches_2026_supplement.csv").write_text(
                HEADER + ",match_date,winner_source_name\n"
                "t31,Testville,Hard,I,20261116,1,1,Ann Strong,2,Bea Weak,6-3 6-4,3,F,"
                "60,30,12,60,22,10,5,40,20261119,Anna Strong\n",
                encoding="utf-8",
            )
            refreshed = tf.ratings(root, "wta")
            self.assertEqual(refreshed.matches, original.matches + 1)
            self.assertEqual(date.fromordinal(refreshed.last_day), date(2026, 11, 19))
            self.assertEqual(refreshed.find("Anna Strong"), refreshed.find("Ann Strong"))

    def test_stronger_player_is_favoured_and_live_score_moves_the_chance(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive(root)
            pre = tf.build(root, FIXTURE, None)
            self.assertTrue(pre["supported"])
            self.assertGreater(pre["teams"][0]["win"], 0.7)
            self.assertEqual(pre["surface"]["name"], "Hard")
            self.assertEqual(pre["h2h"]["wins"], [30, 0])
            self.assertAlmostEqual(sum(row["chance"] for row in pre["set_scores"]), 1.0, places=2)
            behind = tf.build(root, FIXTURE, {"ok": True, "state": "in", "names": ["Ann Strong", "Bea Weak"], "winner": None,
                                              "sets": [{"a": 3, "b": 6, "done": True}, {"a": 1, "b": 4, "done": False}]})
            self.assertEqual(behind["live"]["sets"], [0, 1])
            self.assertLess(behind["live"]["win"][0], pre["teams"][0]["win"])
            self.assertEqual(ai_check.checkpoint(behind), "live-set2-early")
            flipped = tf.build(root, FIXTURE, {"ok": True, "state": "in", "names": ["Bea Weak", "Ann Strong"], "winner": None,
                                               "sets": [{"a": 6, "b": 3, "done": True}, {"a": 4, "b": 1, "done": False}]})
            self.assertEqual(flipped["live"]["win"], behind["live"]["win"])
            self.assertFalse(tf.build(root, {**FIXTURE, "team": "TBD"}, None)["supported"])

    def test_forecast_is_saved_then_graded_with_the_ai_pick(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive(root)
            forecast = tf.build(root, FIXTURE, {"ok": True, "state": "pre", "names": ["Ann Strong", "Bea Weak"], "sets": []})
            tracker.record(root, FIXTURE, forecast)
            tracker.ai_save(root, FIXTURE, "pre", {"shift": -3, "win": [0.8, 0.2], "at": "2026-11-13T09:40:00+00:00"})
            result = tracker.grade_tennis(root, "tennis-1", {"ok": True, "state": "post", "winner": 0, "note": "",
                                                             "sets": [{"a": 6, "b": 2, "done": True}, {"a": 6, "b": 4, "done": True}]})
            self.assertTrue(result["winner_pick"]["correct"])
            self.assertEqual((result["set_score"]["actual"], result["ai_pick"]["correct"]), ("2-0", True))
            summary = tracker.track_record(root)["summary"]
            self.assertEqual((summary["winner"], summary["ai_winner"]), ({"n": 1, "correct": 1}, {"n": 1, "correct": 1}))


class AiCheck(unittest.TestCase):
    NAMES = ["India", "New Zealand"]

    def test_reply_is_parsed_and_capped(self):
        check = ai_check.parse('Sure! {"favours": "new zealand", "points": 40, "headline": "NZ on top", "reasons": ["a", 7, "b"], "watch": "dew"}', self.NAMES)
        self.assertEqual((check["shift"], check["reasons"], check["readable"]), (-ai_check.MAX_SHIFT, ["a", "b"], True))
        self.assertEqual(ai_check.parse('{"favours": "neither", "points": 3}', self.NAMES)["shift"], 0)
        self.assertEqual(ai_check.parse("India look in trouble.", self.NAMES)["shift"], 0)      # prose is shown, never applied
        self.assertFalse(ai_check.parse("", self.NAMES)["readable"])

    def test_check_applies_only_at_its_own_checkpoint(self):
        forecast = {"intel": {"state": "pre"}, "stage": "post_toss", "teams": [{"win": 0.6}, {"win": 0.4}]}
        block = ai_check.attach(dict(forecast), {"post_toss": {"shift": 4, "at": "t"}}, True, 10, 20)
        self.assertEqual((block["win"], block["due"]), ([0.64, 0.36], False))
        stale = ai_check.attach(dict(forecast), {"pre_toss": {"shift": 4, "at": "t"}}, True, 10, 20)
        self.assertEqual((stale["win"], stale["due"], stale["earlier"]["shift"]), ([0.6, 0.4], True, 4))
        self.assertFalse(ai_check.attach(dict(forecast), {}, True, 10, 300)["due"])       # too early to ask unprompted
        self.assertFalse(ai_check.attach(dict(forecast), {}, True, 0, 20)["can_ask"])     # budget spent
        self.assertFalse(ai_check.attach(dict(forecast), {}, False, 10, 20)["can_ask"])   # no key

    def test_live_check_explains_when_the_forecast_is_waiting_for_scores(self):
        forecast = {"intel": {"state": "in"}, "teams": [{"win": 0.6}, {"win": 0.4}]}
        block = ai_check.attach(forecast, {}, True, 10, None)
        self.assertFalse(block["can_ask"])
        self.assertIn("when a live forecast is available", block["note"])
        forecast["intel"]["state"] = "post"
        self.assertIn("match is over", ai_check.attach(forecast, {}, True, 10, None)["note"])


if __name__ == "__main__":
    unittest.main()
