# MatchLab — local sports forecasts

MatchLab combines locally fitted sports models with the official **TabICLv2 classifier/regressor** and **Amazon Chronos-Bolt Small** on CPU. The pretrained weights are verified against publisher hashes. Inference runs locally.

## Match dashboard

Double-click `start.cmd`. [MatchLab](http://127.0.0.1:8766) lists live and upcoming cricket, tennis and Formula 1 fixtures. **Track record** shows saved, graded and pending forecasts by sport. Accuracy counts forecasts saved before the start. Run an F1 forecast in [the race lab](http://127.0.0.1:8766/lab?sport=f1) to save it.

- Live cricket match pages refresh the ESPN score about every 12 seconds. **Over-by-over analysis** shows the latest observed score for each over, projected runs and changes in win chance. Capture runs while the match page is open and depends on the scoreboard's update frequency.
- **Formula 1 → Lap-by-lap analysis** shows the leader, fastest lap time and race movement for the latest completed Grand Prix from Jolpica. While a race is in progress, the panel checks ESPN for the current lap and running order and keeps the updates observed while the page is open.
- [Workspace UI and UX guidance](AGENTS.md) uses Meta's Astryx skill and the existing MatchLab theme tokens.

- Rebuild the simulator's data after refreshing the Cricsheet archive: `.\.venv\Scripts\python.exe tools\build_cricket_balls.py`
- Re-run the held-out test: `.\.venv\Scripts\python.exe tools\backtest_cricket_sim.py --family short --matches 500`
- Request budgets (CricketData.org 100/day, OpenRouter 50/day by default) are counted in `data/local/api_budget.json`. Toss, XIs and live scores use ESPN's free feed.
- Design, measured accuracy and known gaps: [docs/superpowers/specs/2026-11-11-match-dashboard-design.md](docs/superpowers/specs/2026-11-11-match-dashboard-design.md)

## Start / restart

```powershell
Set-Location 'D:\Sports Prediction'
.\.venv\Scripts\python.exe app.py --port 8766 --open
```

Open [MatchLab](http://127.0.0.1:8766), or double-click `start.cmd`. Stop a foreground run with Ctrl+C. Port 8766 avoids the previous demo dashboard on 8765. `app.py` still accepts `--config` and `--port`. Use the supplied environment: default system Python lacks these model runtimes.

To restart the managed background dashboard, run `Set-Location 'D:\Sports Prediction'` then `.\restart.ps1`. This verifies the recorded process belongs to this project before stopping it and its Python child, starts a hidden local server and opens the browser. `-NoOpen` skips opening another browser tab.

## Real-data support

| Sport | Imported real matches | TabICL outcomes / both-side scores | Player score / threat | Chronos form |
| --- | --- | --- | --- | --- |
| Football | 1,140 EPL 2021–2024 | Yes, including draws | Missing source data | Teams |
| Cricket | 1,195 IPL T20 2008–2026 | Yes, completed binary result | Runs; batter-vs-bowler boundary fraction | Teams / players |
| Tennis | 14,965 ATP best-of-three, 2020 to 18 Nov 2026 | Yes, sets, no draws | Aces; total match points won fraction | Competitors / players |
| Badminton | 3,723 men's singles matches, 2018–2022 | Trained logistic outcomes and ridge scores | Points and rally-win fraction from the selected ShuttleSet annotations | Competitors / players with 8+ results |
| Baseball | 2,424 MLB 2023 | Yes, runs, no draws | Missing source data | Teams |
| Rugby | 625 Super Rugby union 2011–2015 | Yes, points, including draws | Missing source data | Teams |

Availability depends on the selected sides, players and cutoff. Badminton combines BWF World Tour men's singles with de-duplicated ShuttleSet and ShuttleSet22 records. Badminton history ends in October 2022, and its player-level models still rely on the small set of annotated matches. Football, baseball and rugby need player and interaction records for player-level predictions.

The **Data workspace** selector switches between real data and the preserved fictional demonstration. Synthetic mode uses labeled historical arithmetic. Real adapters reject synthetic data. Model failure never falls back to reference/demo estimates. Existing recent-form charts, head-to-head results, player selectors, configuration editing, reload and exports remain available.

## Which model makes each prediction

The dashboard uses a weighted Elo + logistic ensemble for football and tennis, Elo for baseball and rugby, trained logistic for badminton and IPL post-toss outcomes, and TabICL for IPL pre-match outcomes and player predictions. The ensemble blends locally fitted probabilities using only results available before the prediction cutoff. Trained ridge estimates both sides' scores. Outcome forecasts display the measured held-out record. The portable `config.pretrained.example.json` configures the TabICL match models used in the pretrained tests. [Model comparison](MODEL_COMPARISON.md)

## Global cricket dataset

Build the CSV dataset, coverage audit, and correlation report from the Sports Prediction directory.

```powershell
.\.venv\Scripts\python.exe tools\build_cricket_coverage.py --refresh
```

Use `--offline` to rebuild from cached sources. Open `data/real/cricket_global/latest.json` to find the current snapshot, then open `summary.md` in that snapshot. It includes match and innings tables, competition and jurisdiction coverage, correlations, and a field-level accuracy audit. The refresh command can run daily from a local scheduler. [Source and audit details](DATA_SOURCES.md#global-cricket-dataset)

## Today's matches and match context

The **Today's Matches** panel lists fixtures that start today in this machine's local time, or are in progress now, with status and scores. `tools/fetch_today_matches.py` reads public scoreboards for football, cricket, tennis, baseball and rugby in a separate process when you press **Check updates** (the server process itself stays offline). There is no schedule source for badminton. A source that fails is named in the panel. Standard matchup analysis links a fixture to the active dataset by team name. Cricket previews also use the global cricket archive.

To use CricketData.org, paste your API key as the only line in `data/local/cricketdata.key`, save it, then select **Today's Matches → Check updates**. The refresh reads the local text file each time. ESPN supplies cricket fixtures if the file is empty or missing, the CricketData.org request fails, or it returns no matches for the panel.

### Cricket analysis and OpenRouter summaries

Open [Data & models → OpenRouter cricket summaries](http://127.0.0.1:8766/#openrouter-settings), paste an OpenRouter API key into the password field, and select **Save key**. Windows encrypts the saved key for the current user. On other systems, the field saves the key for the running session. You can also set `OPENROUTER_API_KEY` before starting MatchLab.

In **Today's Matches → Cricket**, select **Analyze cricket** on a fixture. For a manually selected cricket matchup, use **Analyze matchup**. The panel shows up to 15 prior same-format matches per team and 15 appearances per player, with runs and wickets from Cricsheet deliveries. A local nearest-neighbor model estimates player runs and bowler-credited wickets per appearance. The roster uses each team's last archived playing squad unless you enter the starting XIs for a manual matchup.

Team checkpoints estimate cumulative runs in each side's first innings, every five overs through the format's limit or 90 overs in Tests and other multi-day cricket. The Hundred uses 25-ball checkpoints. Forecasts carry the final score forward when a historical innings ends early. The panel reports the actual sample size and leaves estimates blank when the archive is too sparse. Test and Abu Dhabi T10 fixture analyses also show the existing outcome forecast and its backtest.

Analyze displays local results and, when a key is configured, sends fixture details, selected historical records and available forecasts to `openrouter/free` for a summary. Free-tier rate limits apply. [OpenRouter Free Models Router](https://openrouter.ai/openrouter/free)

In Cricket, open **Toss and starting XIs** to enter the toss winner and decision. Each XI starts with the team's last recorded starting lineup. Edit the names and select **Use toss and XIs** to run the post-toss model. The trained cricket models use season-aware Elo, ground history and historical player form. The backtest evaluates the pre-match and post-toss stages on the same 239 IPL matches. [Evaluation](EVALUATION.md)

### Win chance, AI checks and tennis (added 13 Nov 2026)

- **Cricket win chance** blends the ball-by-ball simulation with a team rating built from past results (`matchlab/cricket_ratings.py`). On held-out matches the winner pick rose from 60% to 65% (T20, 500 matches), 65% to 74% (T20 internationals, 300) and 53% to 57% (one-day, 273). Refit the blend with `python tools/backtest_cricket_sim.py --rescore artifacts/cricket-sim-backtest-t20.json`.
- **Live cricket** now reads the scorecard: the batters at the crease and the overs each bowler has used go into the projection.
- **AI checks** (`matchlab/ai_check.py`): at each stage of a match a free OpenRouter model reads the model's numbers and the live score and may move the win chance by at most 5 points, with reasons. One request per stage, at most 12 per match, metered by the budget ledger, saved in `data/local/predictions.json` and graded on the Track record page. The page works without it.
- **Tennis** (`matchlab/tennis_forecast.py`) uses surface-aware Elo from ATP and WTA results since 2020 and a point-by-point set model. The local 19 November 2026 snapshot includes ATP Challenger results through 19 November and WTA 125 results through 18 November. The ATP main-tour results used in the best-of-three dataset run through 18 November. See [data sources and coverage](DATA_SOURCES.md#tennis-match-dashboard). Run `python tools/fetch_tennis_archive.py` to refresh the base archive, `python tools/import_public_data.py tennis` to rebuild the best-of-three dataset, and `python tools/backtest_tennis.py` to rerun the Elo backtest.

## Formula 1

Select **Formula 1**, a season and a Grand Prix. The default is the next scheduled race in the local calendar. **Pre-weekend** uses earlier driver, constructor and circuit form. **Post-qualifying** adds the starting grid. A recorded Grand Prix loads its archived grid. For a race beyond the result snapshot, open **Starting grid** and select **Check updates** or enter positions manually. Use 0 for a driver without a regular grid slot.

The model fits retirement and finishing order locally and simulates 10,000 races. The table shows each driver's win, podium and top-10 probabilities and expected finish. Completed Grands Prix in the archive show actual positions. The archive is delayed, and the dashboard names the source of the selected field and grid. [Data sources](DATA_SOURCES.md)

## Exact targets and features

- **TabICL classifier:** match outcome probabilities (`team`, `opponent`, optionally `draw`). Both historical orientations enter together. All legal classes must occur in context, or outcome inference is unavailable.
- **TabICL regressor:** opponent-adjusted expected score for each side; separate player appearance examples target individual goals/runs/aces/points/hits where recorded. Player predictions do not assume future lineup selection.
- **Player threat:** regression on the actual success fraction per directional **pair-match**, equally weighted regardless of opportunity count. Cricket measures batter fours/sixes divided by non-wide deliveries from a bowler (no-balls included; non-boundary overthrows excluded). Tennis measures total match points won fraction, derived from both players' serve statistics. Badminton measures match points/rallies won fraction from recorded terminal scoreboards; missing broadcast stroke rows are not invented. The output is an expected next-match fraction, not a calibrated probability for one ball/point or generic danger. Direct prior meetings are optional, but actual interaction history for both selected players is required. No interactions means unavailable.
- **Chronos:** next-appearance scoring-form **median** from the last 8–64 chronological scores, with 10th/90th model quantiles. Opponent, venue, lineup and calendar spacing are not inputs. Its panel is separate from TabICL opponent-adjusted scores; quantiles have no measured sports coverage guarantee.

Features include previous scoring/conceding means, win/draw rates, history counts, head-to-head statistics, recorded venue and days since the previous available result. Player contexts add score mean/variation, appearances, previous scores against the selected side and action/conceded-rate histories. Winner-coded source columns, current match scores/results and numeric identity encodings are never inputs. Exact inputs, raw outputs, targets, context counts/dates/hashes and original model checksums are expandable in the dashboard.

Each historical example uses information strictly before **its own** pre-match date. Query contexts contain only results available before the selected cutoff. Same-day results are excluded. The tennis best-of-three dataset uses tournament start plus 14 days as result availability for archive rows and the published match day for supplemental rows.

CPU defaults: at most 192 recent eligible rows per task, minimum 24, two ensemble members, four PyTorch threads. A side/player needs two previous observations. Official `fit()` prepares labels, preprocessing and context; pretrained weights are never optimized. Official NaN handling represents absent head-to-head/versus statistics. Contexts are separate by sport/task; all sports share the same original weight files. Regression results are explicitly clipped to nonnegative scores, [0,1] fractions or [0,2] best-of-three set/game expectations; raw results and transformations remain visible.

## Installation and provenance

- [INSTALLATION.md](INSTALLATION.md): model paths, exact checksums, pinned runtime versions and measured disk sizes.
- [DATA_SOURCES.md](DATA_SOURCES.md): sources, licenses, coverage, import transformations and gaps. Original downloads/notices remain under `data/raw`; derived CSVs/checksums under `data/real/<sport>`.
- [EVALUATION.md](EVALUATION.md): measured held-out results and simple baselines, including tasks where the model did worse. Publisher benchmarks are not sports accuracy.
- `models/manifest.json`: publisher revisions, URLs, sizes and SHA-256. Original `.ckpt` files: `models/tabicl/`. Chronos: `models/chronos-bolt-small/`.
- `config.local.json`: active real config. `config.pretrained.example.json`: portable equivalent. `config.demo.json`: original synthetic workspace.
- [docs/LEGACY_DASHBOARD.md](docs/LEGACY_DASHBOARD.md): preserved original documentation and generic ONNX/joblib/TorchScript/Keras/linear-JSON contracts; its old model-download status is superseded.

The tennis archive uses CC BY-NC-SA 4.0, and the supplement follows its sources' noncommercial terms. Cricsheet JSON uses ODC Attribution 1.0. Retrosheet credit is displayed in Data & models. Notices for CC0 rugby/football and MIT ShuttleSet annotations are retained; no videos were downloaded.

Setup is already completed. A fresh installation can create Python 3.12 with `uv venv --python 3.12 .venv`, install the pinned official libraries from `requirements-lock.txt` (CPU PyTorch uses its official wheel index), then explicitly run these **one-time online setup** commands:

```powershell
.\.venv\Scripts\python.exe tools\setup_assets.py --models --data
.\.venv\Scripts\python.exe tools\import_public_data.py
.\.venv\Scripts\python.exe tools\configure_pretrained.py
.\.venv\Scripts\python.exe tools\apply_best_models.py
```

The server never imports the download script. Existing source downloads are reused; model size/hash checks fail closed. Do not run two setup instances concurrently. Intentional CSV edits require re-importing or updating verified provenance after checking the change. The original model files are never overwritten by inference.

## Offline privacy

The server binds to 127.0.0.1. UI assets are local. Same-origin protections, session tokens, CSP and the static-file allowlist remain enabled. Model/dataset files are not served as static content. Hub/Transformers telemetry and download flags are disabled before runtime imports. Adapters use `allow_auto_download=False`, `local_files_only=True`, `trust_remote_code=False` and explicit CPU/local paths. Cache paths are on D:.

Actual inference was verified with outbound Python sockets and external DNS blocked by the application guard. This is application-level offline testing, not an operating-system sandbox for arbitrary hostile native code. No user files, datasets or queries were uploaded.

## Verify and evaluate

```powershell
$env:MATCHLAB_REAL_TESTS='1'
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --check web/app.js
.\.venv\Scripts\python.exe tools\smoke_real_models.py
.\.venv\Scripts\python.exe tools\evaluate_pretrained.py --matches 32
```

The suite covers downloaded-weight CPU inference, historical cutoffs, outcome and score validation, model and data integrity, localhost endpoints, the badminton importer and seeded Formula 1 forecasts. Set `MATCHLAB_REAL_TESTS=1` to include the three downloaded-weight tests.

Run `.\.venv\Scripts\python.exe tools\evaluate_models.py --sports cricket badminton f1` to reproduce the current stages and overall top-pick accuracy. Models freeze fitting before a chronological 80/20 split. Earlier completed results may enter later features. The current reports are [EVALUATION.md](EVALUATION.md), [MODEL_COMPARISON.md](MODEL_COMPARISON.md) and [the results JSON](artifacts/model-comparison.json). The older 32-match pretrained and Chronos evaluation remains in `artifacts/evaluation.json`.
