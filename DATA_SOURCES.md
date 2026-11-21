# Public historical data and limitations

Raw sources and their notices remain under data/raw. Derived CSVs and individual SHA-256 checksums are under data/real/<sport>/provenance.json. No local data or queries were uploaded. The initial local search found only the original synthetic demo sports CSVs; unrelated business CSVs were not used. D:\WindowsApps was inaccessible to the filename search.

| Sport | Matches | Result availability coverage | Player appearances | Pair-match interactions | License |
| --- | --- | --- | --- | --- | --- |
| football | 1140 | 2021-08-13 to 2024-05-19 | 0 | 0 | CC0-1.0 |
| cricket | 1195 | 2008-04-18 to 2026-05-31 | 26835 | 59486 | ODC-BY-1.0 (https://opendatacommons.org/licenses/by/1-0/) |
| tennis | 14965 | 2020-01-20 to 2026-11-18 | 28204 | 28204 | Noncommercial use under the terms of each source |
| badminton | 3723 | 2018-01-09 to 2022-10-30 | 98 | 98 | BWF match data CC BY-SA 4.0. ShuttleSet annotations MIT. |
| baseball | 2424 | 2023-03-30 to 2023-10-01 | 0 | 0 | Retrosheet free reuse with mandatory attribution |
| rugby | 625 | 2011-02-18 to 2015-07-04 | 0 | 0 | CC0 (publisher DESCRIPTION) |
| Formula 1 | 270 Grands Prix | 2014-03-16 to 2026-10-25 | 5,501 race entries | — | CC BY-NC-SA 4.0, noncommercial |

## football

[OpenFootball football.json; English Premier League 2021–2024](https://github.com/openfootball/football.json)

License: CC0-1.0

- Full-time league results only. No player appearances or interactions.

- Historical snapshot ends May 2024; no current injuries, lineups, transfers or fixtures.

## cricket

[Cricsheet IPL JSON, 2008–2026; credit Cricsheet](https://cricsheet.org/)

License: ODC-BY-1.0 (https://opendatacommons.org/licenses/by/1-0/)

Recorded identity normalizations: {"Royal Challengers Bangalore": "Royal Challengers Bengaluru (same franchise; historical records combined)", "Delhi Daredevils": "Delhi Capitals (same franchise; historical records combined)", "Kings XI Punjab": "Punjab Kings (same franchise; historical records combined)", "Rising Pune Supergiants": "Rising Pune Supergiant (same franchise; historical records combined)", "Feroz Shah Kotla": "Arun Jaitley Stadium (same ground)", "Sardar Patel Stadium": "Narendra Modi Stadium (same ground)", "Punjab Cricket Association Stadium": "Punjab Cricket Association IS Bindra Stadium (same ground)", "Subrata Roy Sahara Stadium": "Maharashtra Cricket Association Stadium (same ground)"}

- Each match also records ground, city, toss winner, toss decision and season. No pitch-condition or weather measurements exist in the source.

- Completed standard IPL T20 matches only; DLS, no-result and super-over matches excluded.

- Player runs are per listed appearance, including did-not-bat zeroes; not conditional on batting position.

- Boundary threat is expected fraction of non-wide deliveries producing a batter four/six against a bowler; no-balls count, non-boundary overthrows do not.

- Chasing totals are truncated by reaching the target. The post-toss model uses the supplied toss, decision and starting XIs. Historical starting XIs exclude documented incoming replacements and require 11 identified starters.

## Global cricket dataset

The global export uses the [full Cricsheet archive](https://cricsheet.org/downloads/) under ODC-BY-1.0, the [official Abu Dhabi T10 match centre](https://www.abudhabit10.com/t10x/matches), [CREX series schedules and archives](https://crex.com/fixtures/league/series), and the ESPN cricket scoreboard. The [UN M49 register](https://unstats.un.org/unsd/methodology/m49/) supplies country and territory names. The per-row URLs identify where the data came from.

- Match and innings exports retain published names, and league IDs group documented name variants. Cricsheet innings totals include deliveries and innings penalties. Legal ball counts omit wides and no-balls. Super overs have their own innings rows. The supplemental scoreboard preserves published scores where the underlying innings detail is unavailable.
- `coverage.csv` reports published schedule counts where available and includes entries for jurisdictions needing domestic sources. Cricsheet [documents its archive coverage](https://cricsheet.org/coverage/) and [explains the Afghan matches it withholds](https://cricsheet.org/article/explanation-for-withholding-of-afghanistani-matches/). The build adds available records for those competitions from other sources. Many local, youth, and historical fixtures remain outside the available feeds.
- `accuracy_audit.csv` compares independently published results and innings totals for matched fixtures. It records matches, conflicts, missing fields, and unlinked references. Global accuracy remains unmeasured while only selected cohorts have independent reference records.
- `correlations.csv` reports differences in win rates or first-innings scoring rates within comparable formats and team categories. A team's pre-match form uses five prior decisive results. Scoring rates are runs per six legal balls. Intervals account for repeated teams when enough clusters are available. The estimates describe associations.
- Each successful build publishes a dated snapshot and updates `latest.json`. The manifest records row counts, file hashes, and source errors. The raw archive and feed snapshots are cached under `data/raw/cricket`. The IPL forecasting input is under `data/real/cricket`.

## tennis (match dashboard)

The base ATP and WTA ratings archive under `data/raw/tennis_tour/` covers singles since 2020. It comes from [Jeff Sackmann / Tennis Abstract, retained by Aneeshers](https://github.com/Aneeshers/tennis-sackmann-archive) under CC BY-NC-SA 4.0. `tools/fetch_tennis_archive.py` downloads the base archive.

The 19 November 2026 supplement in `data/local/tennis_results/` adds 5,862 ATP and 3,481 WTA singles results. It uses [TennisMyLife](https://stats.tennismylife.org/tennis-match-database) for ATP and WTA tour records, ATP qualifying and Challenger main draws. The [ESPN scoreboard](https://www.espn.com/tennis/scoreboard) supplies WTA qualifying and WTA 125 scores and verifies match dates for WTA tour results. The [Sydney scoreboard](https://results.tennisdata.com/en) verifies individual match dates for two ATP Challenger results on 19 November. Each supplemental row retains its source URL. The local supplement is for noncommercial use under source terms.

The latest completed results in this snapshot are 18 November for the ATP main tour, 19 November for ATP Challenger, 15 November for the WTA main tour, and 18 November for WTA 125. Men's Challenger qualifying and women's ITF coverage still end in early June. Some supplemental records have a tournament week as their only date. `data/local/tennis_results/snapshot.json` records coverage and checksums.

## tennis

[Jeff Sackmann / Tennis Abstract, retained archive by Aneeshers](https://github.com/Aneeshers/tennis-sackmann-archive) and [TennisMyLife](https://stats.tennismylife.org/tennis-match-database)

The archive uses CC BY-NC-SA 4.0. Supplemental data follows its source's noncommercial usage terms.

- Only completed best-of-three ATP men's singles; no Grand Slam best-of-five or retirements.

- Archive rows use the tournament start for `pre_match_date` and start +14 days for result availability. Supplemental rows use the published match day for both. Forecast features use results available strictly before the prediction day.

- Aces only where reported; missing aces omitted, never imputed as zero.

- Match context includes tournament, surface, level and round. Archive rows also include entry rankings and points where published.

- Point threat: fraction of total match points won, derived from both players' serve points and serve points won. No shot-level context.

## badminton

[ShuttleSet and ShuttleSet22, Wei-Yao Wang and collaborators (KDD 2023 / IJCAI 2023)](https://github.com/wywyWang/CoachAI-Projects)

License: MIT (publisher root LICENSE, copyright 2022 Wei-Yao Wang); annotations only, no videos

- The men's singles match archive adds 3,663 unique completed matches to 60 ShuttleSet matches. It covers 9 January 2018 through 28 March 2021. The combined data ends on 30 October 2022. Current forecasts use strengths estimated from that historical sample. [Badminton BWF World Tour, sanderp, CC BY-SA 4.0](https://www.kaggle.com/datasets/sanderp/badminton-bwf-world-tour)

- The importer harmonizes names, orders sides alphabetically, excludes retirements, derives games won from legal terminal game scores, and de-duplicates by match date and player pair. Tournament tier and round are retained when recorded. The BWF-derived match data is shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

- Match games won from recorded winner/game count. Player points and pair-match rally totals use explicit terminal scoreboards, checked for legal games, last-point winner and match winner. Missing broadcast stroke/rally rows are not invented; ambiguous terminal scores are omitted.

- Rally threat is fraction of total scoreboard points (rallies) won per match; no calibrated per-rally probability claim.

## baseball

[Retrosheet game logs, MLB 2023 regular season](https://www.retrosheet.org/)

License: Retrosheet free reuse with mandatory attribution

The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.

- Team game logs only, no individual batting or pitcher interactions. Suspensions, forfeits and ties excluded.

- Team abbreviations are Retrosheet identifiers. Historical snapshot, no current lineups.

## rugby

[Thomas McMahon superrugby; original results collated by Kevin Lassen](https://github.com/thmcmahon/superrugby)

License: CC0 (publisher DESCRIPTION)

- Super Rugby union only, 2011–2015. Historical team names retained; no rugby league, current form, players or carry interactions.

- Scores are final match points, including extra time in knockout fixtures. Draws are possible in league play.

## Formula 1

- The public delayed `jolpica-f1-csv.zip` archive was published on 27 October 2026. Its 14,669,906 bytes match the publisher SHA-256 `3154f289f6e8979dd0e42818bf06211568fc8e43af23a4ee4a1dc3daafa790d0`. The derived race, entry, sprint and roster tables are for noncommercial use under CC BY-NC-SA 4.0. [Jolpica database dumps](https://github.com/jolpica/jolpica-f1/blob/main/docs/database_dumps.md) · [Terms of use](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md)

- The model forecasts Grands Prix from 2014 onward and uses earlier sprint results for form. Data available before each cutoff determines training and inputs. The post-qualifying backtest uses recorded starting grids, which can incorporate grid penalties announced after qualifying. Race finishes are treated as available six hours after the scheduled start and sprints after two hours.

- The public archive is delayed. Where it lacks a listed race field, the forecast uses the latest available field in that season. The dashboard shows the source. The live grid lookup makes one Jolpica request when asked and accepts manual grid edits. Historical zero grid values represent no regular starting slot.

The badminton sources (ShuttleSet plus its ShuttleSet22 extension) identify player A as the match winner. Import orientation is alphabetical, and historical contexts include both orientations; winner-coded A/B is never an input feature. Duplicate date/player fixtures across releases are removed. Only the men's singles subset enters this context. Point totals come from observed legal terminal scoreboards, checked against the last-point and match winners; missing stroke rows are never fabricated. Original annotations are retained unchanged.

Cricsheet JSON uses ODC Attribution 1.0. Tennis derived data is for noncommercial use under the terms listed above. Retrosheet attribution is displayed in the dashboard. Rugby's publisher declares CC0 in DESCRIPTION. ShuttleSet root MIT notice is retained; no video footage is downloaded or reused.
