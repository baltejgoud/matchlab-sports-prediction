"""Regression guards for the forecasting engines.

The UI work must never change a prediction. These pin the iteration counts and a fixed-seed result computed from
synthetic inputs, so they do not depend on downloaded data. If one fails after a deliberate model change, update the
golden values in the same commit and say why in the message.
"""
import hashlib
import inspect
import unittest

import numpy as np

from matchlab import cricket_forecast, cricket_sim, f1


class IterationCounts(unittest.TestCase):
    def test_documented_simulation_counts_are_unchanged(self):
        self.assertEqual(cricket_forecast.SIMS, 3000)
        self.assertEqual(f1.SIMULATIONS, 10_000)
        self.assertEqual(inspect.signature(cricket_sim.Model.run).parameters["sims"].default, 3000)
        self.assertEqual(inspect.signature(f1.simulate_race).parameters["simulations"].default, 10_000)


class F1Snapshot(unittest.TestCase):
    def test_fixed_seed_race_simulation_matches_its_snapshot(self):
        utility = np.linspace(-2, 2, 20)
        retirement = np.linspace(.05, .3, 20)
        result = f1.simulate_race(utility, retirement)
        digest = hashlib.sha256(np.round(result, 6).tobytes()).hexdigest()
        self.assertEqual(digest, GOLDEN_F1)
        # A few readable anchors, so a failure says what moved.
        self.assertAlmostEqual(float(result[:, 0].sum()), 1.0, places=9)
        self.assertEqual(result.shape, (20, 4))


GOLDEN_F1 = "034fbf3ee5a14f33d7123d9856a3426e17f2a0db2247863bac93ce3601416da6"

if __name__ == "__main__":
    unittest.main()
