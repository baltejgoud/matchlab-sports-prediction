import copy
import hashlib
import http.client
import json
import math
import shutil
import socket
import tempfile
import threading
import unittest
from pathlib import Path

from app import LocalServer, ROOT
from matchlab.data import Dataset, local_path
from matchlab.engine import Engine, default_config
from matchlab.models import ModelRegistry
from matchlab.sports import SPORTS


class AnalyticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = Engine(default_config(), ROOT)

    def query(self, sport="football", **kwargs):
        teams = self.engine.datasets[sport].teams
        return {"sport": sport, "team": teams[0], "opponent": teams[1], "cutoff": "2026-11-10", "window": 5, **kwargs}

    def test_all_six_sports_produce_finite_labeled_reference_outputs(self):
        self.assertEqual(set(self.engine.datasets), {sport for sport, meta in SPORTS.items() if meta["kind"] == "match"})
        for sport in self.engine.datasets:
            meta = SPORTS[sport]
            with self.subTest(sport=sport):
                a = self.engine.analyze(self.query(sport))
                self.assertTrue(a["demo"])
                self.assertAlmostEqual(sum(a["winner"]["value"].values()), 1)
                self.assertEqual("draw" in a["winner"]["value"], meta["draw"])
                for p in [a["winner"], *a["scores"], a["player_score"], a["threat"]]:
                    self.assertEqual(p["source"], "reference")
                self.assertTrue(all(p["value"] >= 0 for p in a["scores"]))
                self.assertTrue(0 <= a["threat"]["value"] <= 1)
                self.assertEqual(a["meta"]["unit"], meta["unit"])

    def test_cutoff_excludes_current_and_future_matches_from_every_input(self):
        cutoff = "2026-09-20"
        a = self.engine.analyze(self.query(cutoff=cutoff, window=30))
        for rows in [*a["history"], a["h2h"], a["player_history"], a["player_vs_opponent"], a["interaction"]["rows"]]:
            self.assertTrue(all(r["date"] < cutoff for r in rows))
        self.assertLess(a["provenance"]["latest_eligible"], cutoff)
        # Alter all ineligible records; no derived forecast or feature may change.
        cloned = copy.deepcopy(self.engine)
        for match in cloned.datasets["football"].matches:
            if match["date"] >= cutoff:
                match["team_score"] = 99999
                match["opponent_score"] = 88888
                match["outcome"] = "team"
        for row in cloned.datasets["football"].players:
            if row["date"] >= cutoff:
                row["score"] = 99999
        for row in cloned.datasets["football"].interactions:
            if row["date"] >= cutoff:
                row["successes"] = row["opportunities"]
        b = cloned.analyze(self.query(cutoff=cutoff, window=30))
        for key in ("features", "winner", "scores", "player_score", "threat"):
            self.assertEqual(a[key], b[key])

    def test_reference_team_score_formula_and_explicit_outcome(self):
        a = self.engine.analyze(self.query())
        f = a["features"][0]
        expected = .55*f["team_recent_avg"] + .3*f["opponent_recent_conceded"] + .15*f["h2h_avg"]
        self.assertAlmostEqual(a["scores"][0]["value"], expected)
        self.assertEqual(a["h2h_summary"]["matches"], 5)
        # Outcomes come from the explicit field, even when score order differs.
        cloned = copy.deepcopy(self.engine)
        match = cloned.datasets["football"].matches[-1]
        match.update(team_score=0, opponent_score=9, outcome="team")
        h = cloned.datasets["football"].history(match["team"], "2026-11-10")
        self.assertEqual(h[-1]["result"], "W")

    def test_cricket_report_exposes_supported_and_unavailable_surfaces(self):
        a = self.engine.analyze(self.query("cricket"))
        self.assertEqual(a["insights"]["format"], "Cricket")
        self.assertEqual(a["insights"]["pitch_report"]["source"], "unavailable")
        self.assertEqual([r["overs"] for r in a["insights"]["innings_forecasts"]], [10, 20])
        self.assertTrue(all(r["source"] == "unavailable" for r in a["insights"]["innings_forecasts"]))

    def test_catalog_lists_clickable_match_records(self):
        cricket = next(item for item in self.engine.catalog() if item["id"] == "cricket")
        self.assertTrue(cricket["available_matches"])
        self.assertTrue({"match_id", "date", "team", "opponent", "venue"} <= set(cricket["available_matches"][0]))

    def test_specific_opponent_changes_h2h_and_scoring_inputs(self):
        a = self.engine.analyze(self.query())
        third = self.engine.datasets["football"].teams[2]
        b = self.engine.analyze(self.query(opponent=third))
        self.assertTrue(all(r["opponent"] == third for r in b["h2h"]))
        self.assertNotEqual(a["features"], b["features"])

    def test_direct_player_query_aggregates_correct_pair_and_meetings(self):
        ds = self.engine.datasets["cricket"]
        teams = ds.teams[:2]
        player = sorted(ds.rosters[teams[0]])[-1]
        opposing = sorted(ds.rosters[teams[1]])[-1]
        a = self.engine.analyze(self.query("cricket", player=player, opponent_player=opposing, window=10))
        rows = a["interaction"]["rows"]
        self.assertTrue(all(r["player"] == player and r["opponent_player"] == opposing for r in rows))
        self.assertEqual(a["interaction"]["meetings"], 6)
        self.assertAlmostEqual(a["threat"]["value"], sum(r["successes"] for r in rows)/sum(r["opportunities"] for r in rows))
        cloned = copy.deepcopy(self.engine)
        cloned.datasets["cricket"].interactions += copy.deepcopy(rows[-1:])
        b = cloned.analyze(self.query("cricket", player=player, opponent_player=opposing, window=5))
        self.assertEqual(b["interaction"]["meetings"], 5)
        self.assertEqual(len(b["interaction"]["rows"]), 6)

    def test_no_pair_data_is_unavailable_not_zero(self):
        cloned = copy.deepcopy(self.engine)
        cloned.datasets["football"].interactions = []
        a = cloned.analyze(self.query())
        self.assertIsNone(a["threat"]["value"])
        self.assertEqual(a["threat"]["source"], "unavailable")

    def test_invalid_queries_are_actionable(self):
        for query in [self.query(opponent=self.query()["team"]), self.query(cutoff="bad"), self.query(window=0),
                      self.query(cutoff="2020-01-01"), self.query(player="Unknown"), self.query(venue="bad")]:
            with self.subTest(query=query), self.assertRaises(ValueError):
                self.engine.analyze(query)

    def test_real_data_mode_without_models_does_not_fabricate_predictions(self):
        cfg = default_config()
        cfg["sports"]["football"].update(demo=False, reference_mode=False)
        a = Engine(cfg, ROOT).analyze(self.query())
        for p in [a["winner"], *a["scores"], a["player_score"], a["threat"]]:
            self.assertIsNone(p["value"])
            self.assertEqual(p["source"], "unavailable")


class ModelIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.config = default_config()
        self.config["sports"] = {"football": self.config["sports"]["football"]}

    def tearDown(self):
        self.temp.cleanup()

    def artifact(self, task, features, weights, bias, activation="identity", **kwargs):
        path = self.folder / f"{task}.json"
        path.write_text(json.dumps(dict(features=features, weights=weights, bias=bias, activation=activation)))
        spec = dict(path=str(path), format="linear_json", features=features, **kwargs)
        self.config["sports"]["football"]["models"][task] = spec
        return path, spec

    def query(self):
        teams = Engine(self.config, ROOT).datasets["football"].teams
        return dict(sport="football", team=teams[0], opponent=teams[1], cutoff="2026-11-10")

    def test_exact_numeric_inference_class_mapping_and_model_files_unchanged(self):
        # Hand-authored test contracts, not trained sports models.
        paths = []
        paths.append(self.artifact("winner", ["team_recent_avg"], [[0],[0],[0]], [math.log(.2),math.log(.5),math.log(.3)], "softmax", labels=["draw","team","opponent"])[0])
        paths.append(self.artifact("team_score", ["team_recent_avg","opponent_recent_conceded"], [[.6,.4]], [1])[0])
        paths.append(self.artifact("player_score", ["player_recent_avg"], [[.5]], [2])[0])
        paths.append(self.artifact("player_threat", ["interaction_rate"], [[1]], [0])[0])
        before = {p: (hashlib.sha256(p.read_bytes()).hexdigest(),p.stat().st_mtime_ns) for p in paths}
        engine = Engine(self.config, ROOT)
        a = engine.analyze(self.query())
        self.assertAlmostEqual(a["winner"]["value"]["team"], .5)
        self.assertAlmostEqual(a["winner"]["value"]["draw"], .2)
        for i in range(2):
            f = a["features"][i]
            self.assertAlmostEqual(a["scores"][i]["value"], .6*f["team_recent_avg"]+.4*f["opponent_recent_conceded"]+1)
        self.assertAlmostEqual(a["player_score"]["value"], a["features"][0]["player_recent_avg"]*.5+2)
        self.assertAlmostEqual(a["threat"]["value"], a["interaction"]["rate"])
        engine.analyze(self.query())  # Cached inference must also preserve originals.
        for p in [a["winner"], *a["scores"], a["player_score"], a["threat"]]:
            self.assertEqual(p["source"], "model")
            self.assertEqual(len(p["sha256"]), 64)
        self.assertEqual(before, {p: (hashlib.sha256(p.read_bytes()).hexdigest(),p.stat().st_mtime_ns) for p in paths})

    def test_bad_models_never_silently_fall_back(self):
        self.artifact("team_score", ["team_recent_avg"], [[-100]], [-100])
        self.artifact("winner", ["team_recent_avg"], [[0],[0]], [.8,.8], labels=["team","opponent"])
        self.artifact("player_threat", ["interaction_rate"], [[0]], [2])
        a = Engine(self.config, ROOT).analyze(self.query())
        for p in [a["winner"], *a["scores"], a["threat"]]:
            self.assertEqual(p["source"], "unavailable")
            self.assertIsNone(p["value"])
            self.assertIn("error", p)

    def test_missing_unknown_and_mismatched_features(self):
        for features, model_features in [(["unknown"],["unknown"]), (["player_opponent_avg"],["wrong"]), (["interaction_rate"],["interaction_rate"])]:
            with self.subTest(features=features):
                path,spec = self.artifact("team_score", model_features, [[1]], [0])
                spec["features"] = features
                engine = Engine(self.config, ROOT)
                if features == ["interaction_rate"]:
                    engine.datasets["football"].interactions = []
                a = engine.analyze(self.query())
                self.assertIsNone(a["scores"][0]["value"])

    def test_checksum_failure_and_modified_artifact_cache_invalidation(self):
        path,spec = self.artifact("team_score", ["team_recent_avg"], [[0]], [3])
        engine = Engine(self.config, ROOT)
        a = engine.analyze(self.query())
        self.assertEqual(a["scores"][0]["value"], 3)
        path.write_text(json.dumps(dict(features=spec["features"],weights=[[0]],bias=[123],activation="identity")))
        b = engine.analyze(self.query())
        self.assertEqual(b["scores"][0]["value"], 123)
        spec["sha256"] = "0"*64
        c = Engine(self.config, ROOT).analyze(self.query())
        self.assertIn("SHA-256", c["scores"][0]["error"])

    def test_untrusted_serialized_file_is_rejected_before_loading(self):
        path = self.folder / "unknown.pkl"
        path.write_bytes(b"this is never deserialized")
        registry = ModelRegistry({"winner":dict(path=str(path),format="joblib",features=["team_recent_avg"],labels=["team","opponent"])},ROOT)
        self.assertIn("trusted", registry.inspect("winner")["message"])
        with self.assertRaises(ValueError):
            registry.predict("winner", {"team_recent_avg":2})


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        shutil.copytree(ROOT / "data/demo/football", self.folder, dirs_exist_ok=True)

    def tearDown(self):
        self.temp.cleanup()

    def test_csv_invalid_numbers_duplicates_and_impossible_interactions(self):
        original = (self.folder / "matches.csv").read_text()
        lines = original.splitlines()
        invalid = [original+lines[1]+"\n", original.replace(",3,", ",NaN,",1)]
        cells = lines[1].split(",")
        cells[4] = "-2"
        invalid.append("\n".join([lines[0],",".join(cells),*lines[2:]]))
        for data in invalid:
            (self.folder / "matches.csv").write_text(data)
            with self.assertRaises(ValueError):
                Dataset(self.folder,SPORTS["football"])
        (self.folder / "matches.csv").write_text(original)
        (self.folder / "interactions.csv").write_text("match_id,player,opponent_player,opportunities,successes,score\nfoo,unknown,unknown,2,3,0\n")
        with self.assertRaises(ValueError):
            Dataset(self.folder,SPORTS["football"])

    def test_optional_player_files_can_be_absent(self):
        (self.folder/"players.csv").unlink()
        (self.folder/"interactions.csv").unlink()
        ds = Dataset(self.folder,SPORTS["football"])
        self.assertEqual(ds.players, [])
        self.assertEqual(ds.interactions, [])

    def test_remote_paths_rejected(self):
        for value in ("https://example.com/model.onnx", "//host/share", "\\\\host\\share"):
            with self.assertRaises(ValueError):
                local_path(value, ROOT)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = LocalServer(("127.0.0.1",0),Engine(default_config(),ROOT))
        cls.thread = threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self,method,path,body=None,headers=None):
        connection = http.client.HTTPConnection("127.0.0.1",self.server.server_port,timeout=5)
        connection.request(method,path,body=json.dumps(body) if body is not None else None,headers=headers or {})
        response = connection.getresponse()
        code,headers,data = response.status,dict(response.getheaders()),response.read()
        connection.close()
        return code,headers,data

    def auth(self):
        return {"Content-Type":"application/json","X-MatchLab-Token":self.server.token}

    def test_page_and_assets_are_local_and_no_arbitrary_files_served(self):
        for route in ("/","/app.js","/style.css","/favicon.svg"):
            code,headers,body = self.request("GET",route)
            self.assertEqual(code,200)
            self.assertIn("default-src 'self'",headers["Content-Security-Policy"])
            self.assertNotIn(b"https://",body)
        self.assertEqual(self.request("GET","/../README.md")[0],404)

    def test_today_matches_endpoint(self):
        code,_,body = self.request("GET","/api/today-matches")
        self.assertEqual(code,200)
        data = json.loads(body)
        self.assertIn("sports",data)
        self.assertIn("cricket",data.get("sports",{}))
        self.assertIn("tennis",data.get("sports",{}))

    def test_api_prediction_token_and_host_origin_controls(self):
        code,_,body = self.request("GET","/api/state")
        self.assertEqual(code,200)
        catalog = json.loads(body)["catalog"]
        for sport in catalog:
            query = dict(sport=sport["id"],team=sport["teams"][0],opponent=sport["teams"][1],cutoff="2026-11-10")
            code,_,data = self.request("POST","/api/analyze",query,self.auth())
            self.assertEqual(code,200,data)
        self.assertEqual(self.request("POST","/api/analyze",{}, {"Content-Type":"application/json"})[0],403)
        self.assertEqual(self.request("GET","/api/state",headers={"Host":"evil.example"})[0],403)
        self.assertEqual(self.request("GET","/api/state",headers={"Origin":"https://evil.example"})[0],403)
        self.assertEqual(self.request("POST","/api/analyze",{}, {**self.auth(),"Origin":"null"})[0],403)

    def test_session_endpoint_is_small_and_carries_the_token(self):
        code,headers,body = self.request("GET","/api/session")
        self.assertEqual(code,200)
        data = json.loads(body)
        self.assertEqual(data["token"],self.server.token)
        self.assertLess(len(body),1000)
        self.assertEqual(headers["Cache-Control"],"no-store")
        self.assertEqual(self.request("GET","/api/session",headers={"Host":"evil.example"})[0],403)

    def test_static_files_are_revalidated_or_cached_and_security_headers_stay(self):
        expected = {"/dash.js":"no-cache","/dash.css":"no-cache","/":"no-cache","/outfit.woff2":"public, max-age=604800, immutable"}
        for route,cache in expected.items():
            code,headers,body = self.request("GET",route)
            self.assertEqual(code,200,route)
            self.assertEqual(headers["Cache-Control"],cache,route)
            self.assertIn("connect-src 'self'",headers["Content-Security-Policy"])
            self.assertNotIn("*",headers["Content-Security-Policy"])
            self.assertEqual(headers["X-Content-Type-Options"],"nosniff")
            self.assertTrue(headers["ETag"].startswith('"'))
            code,again,empty = self.request("GET",route,headers={"If-None-Match":headers["ETag"]})
            self.assertEqual(code,304,route)
            self.assertEqual(empty,b"")
            self.assertIn("Content-Security-Policy",again)
        self.assertEqual(self.request("GET","/dash.js",headers={"If-None-Match":'"stale"'})[0],200)

    def test_api_replies_are_never_cached_and_images_cannot_escape_the_web_folder(self):
        for route in ("/api/health","/api/today-matches"):
            self.assertEqual(self.request("GET",route)[1]["Cache-Control"],"no-store",route)
        for route in ("/images/../app.py","/images/%2e%2e/app.py","/images/..%5Capp.py","/images/missing.jpg"):
            self.assertEqual(self.request("GET",route)[0],404,route)

    def test_invalid_config_is_transactional(self):
        original = self.server.engine
        code,_,_ = self.request("POST","/api/config",{"sports":{"football":{"data_dir":"missing-folder"}}},self.auth())
        self.assertEqual(code,400)
        self.assertIs(self.server.engine,original)

    def test_offline_guard_blocks_remote_tcp_and_dns_without_network_use(self):
        with socket.socket() as sock, self.assertRaisesRegex(OSError,"Offline mode"):
            sock.connect(("203.0.113.1",443))
        with self.assertRaisesRegex(OSError,"Offline mode"):
            socket.getaddrinfo("not-a-real-remote-host.invalid",443)
        with self.assertRaisesRegex(OSError,"Offline mode"):
            socket.gethostbyname("not-a-real-remote-host.invalid")
        with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as sock, self.assertRaisesRegex(OSError,"Offline mode"):
            sock.sendto(b"never sent",("203.0.113.1",53))


if __name__ == "__main__":
    unittest.main()
