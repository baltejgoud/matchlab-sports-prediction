# MatchLab UI audit

Date: 2026-11-21. Scope: `web/dash.html`, `web/dash.js`, `web/dash.css`, `app.py`, `matchlab/world.py`.
Method: source read, then the live app on `127.0.0.1:8766` driven with headless Chromium at 360, 768, 1280 and
1920 px for all five views plus a match detail page, and a three-theme computed-contrast sweep.

Evidence (local only; `artifacts/` is git-ignored):

- Screenshots: `artifacts/ui-audit/before/<view>-<width>.png`, `theme-<theme>-<view>.png`
- Contrast data: `artifacts/ui-audit/before/contrast.json`
- Overflow and console log: `artifacts/ui-audit/before/log.json` (no console errors, no CSP violations in any view)

Specialist tags: **UX** senior UI/UX, **FE** front-end, **BE** back-end, **PM** product, **ML** AI/ML, **GenAI**.

Limits of this audit: the schedule data is a saved snapshot, so I saw live, upcoming and finished cards but did not
capture a genuine empty feed or a feed outage from real data; those states are exercised through route stubs in the
verification step. Contrast for text over photographs cannot be computed from CSS alone, so those items are judged
from screenshots. A sweep also reported 44 cards at `opacity:0`; that was an artefact of an animation clock that was
not running (a hidden pane) and of animations replaying after the 5-minute refresh. I treat it as one finding
(F-12, replayed entrance animation), not as invisible content.

## Critical

| ID | Area | Finding | Where |
|---|---|---|---|
| C-1 | Honesty (PM, ML) | The World terminal shows **invented market data as if it were real**: a hard-coded "Order Flow & Analyst Consensus" (Strong Buy, Buy 84% / Hold 13% / Sell 3%, from a fixed table with a made-up fallback), bid/ask prices computed as `price × 0.9996/1.0004` with invented sizes, a literal "Spread $0.06 (0.07%)", invented beta, candlesticks whose open/high/low are synthesised from the close series, volume bars derived from price change, and a "REGULAR TRADING" badge that is always on. Nothing in `tools/fetch_world.py` supplies these fields. The timeframe buttons (1D…ALL) only slice the same 5-session series. Moving averages labelled "SMA 9/21" use periods 5 and 9. | `web/dash.js:1074-1081, 1110-1116, 1171-1173, 1204-1230, 1240-1241, 1250-1253, 1324-1352` |
| C-2 | Honesty | The "live" price is made to **flicker with `Math.random()`** every 3.8 s around the last fetched quote and flashes green or red. It looks like a live feed and is noise. | `web/dash.js:1712-1730` |
| C-3 | Hard-coded facts | `F1_GRID_CARS` hard-codes a 2024 grid (chassis, drivers, engines, aero notes) under the heading "THE 2024–2026 GRID". It is stale (Bottas/Zhou at Sauber, Pérez at Red Bull). Five of ten teams reuse generic photos (Ferrari and Mercedes use the F1 hero, McLaren, Williams and Haas use the grid line-up). Violates the rule against hard-coding time-sensitive facts. | `web/dash.js:888-899, 926` |
| C-4 | Accessibility | `<main aria-live="polite">` wraps the whole app. Every `show()` call (each search keystroke, each 12 s match poll, each refresh) replaces the whole region, so a screen reader re-reads the page. Focus is also not moved on route change. | `web/dash.html:25`, `web/dash.js:60-65, 1847-1861` |
| C-5 | Contrast | Track record hero: the first headline line uses the theme ink colour over a fixed dark overlay (dark on dark, unreadable in all themes); the eyebrow and body copy are muted on the same overlay. | `web/dash.css:1292-1301`, `before/record-1280.png` |
| C-6 | Track record honesty | Hero says "**Verified accuracy & rigor** … Every probability is mathematically calibrated" and shows **31 tracked forecasts**. The list holds forecasts opened after start, and calibration is explicitly not applied until 30 graded forecasts exist (9 today). The headline number mixes qualifying and excluded forecasts. | `web/dash.js:760-769`, `before/record-1280.png` |

## Major

| ID | Area | Finding | Where |
|---|---|---|---|
| M-1 | Perf | Dashboard waits on `/api/state`, a **3.6 MB** payload (full catalogue and configs) that it only uses for `token` and `openrouter_key_status`. It gates first paint. | `web/dash.js:1865`, `app.py:433-438` |
| M-2 | Perf | Every static response, including fonts and 800 KB photos, is sent with `Cache-Control: no-store`. Fonts refetch on every load, which is the real cause of font-swap flashes. | `app.py:422` |
| M-3 | Images | Match-card thumbnails are 38×38 px but load the 1376×768 ~800 KB hero JPEG; 44 cards share three files. No `width`/`height` (layout shift), no `srcset`, and `alt` repeats the sport name on a decorative image next to text that already says the sport. Hero tiles and venue banners are generic stock art that carry no match information. | `web/dash.js:116-126, 155-179, 555, 593, 931` |
| M-4 | Motion | Probability bars, set-score bars and win bars animate **`width`** (layout) and restart from 0 on every poll; the `bar-sweep` shimmer runs forever. `range-pin` animates `left`; the search box animates `width` on focus; `transition: all` on several controls; `will-change` on every button, chip and card. | `web/dash.css:347, 374-379, 461, 608, 942-944, 1047, 1130, 342-352` |
| M-5 | Motion | Live tag pulse animates **`box-shadow`** (paint) on every live card, plus a glowing top bar, so a page with 30 live cards runs **60 infinite animations** (measured: 110 running, 60 infinite). | `web/dash.css:283, 361-362` |
| M-6 | Motion | Hero counters re-count from 0 and the card cascade replays on every re-render (search keystroke, filter, 5-minute refresh, manual refresh). Data-driven motion should play on first reveal only. | `web/dash.js:36-59, 180-187`, `web/dash.css:276` |
| M-7 | Architecture | Whole-view re-render: `show()` rebuilds the DOM for search, filters, refresh, and every 12 s match poll. The match page patches focus, scroll and `<details>` state back by hand. The search box re-renders per keystroke with no debounce and restores the caret manually. | `web/dash.js:60-65, 153-154, 612-702` |
| M-8 | Accessibility | Ticker tape auto-scrolls for ever (36 s loop) with no pause control and **duplicates every quote as a focusable button** (`quotes.concat(quotes)`), doubling tab stops. | `web/dash.js:1118-1138`, `web/dash.css:439` |
| M-9 | Hierarchy | On a match in play, the live win chance, the number the reader came for, is about 1,000 px down the page, below the full pre-match panel. The scoreboard repeats the same teams twice. | `web/dash.js:604-609`, `before/match-detail-1280.png` |
| M-10 | IA | The Matches view puts a three-card sports showcase (duplicating the filter chips) between the hero and the schedule, then lists all 30 live cards flat. At 360 px the page is ~13,800 px tall; "Coming up" is far below the fold. | `web/dash.js:155-179, 188-202`, `before/matches-360.png` |
| M-11 | GenAI | Briefing citation checks: bullets with no valid reference are dropped **silently** (the reader is not told); the **headline is never cited or checked**; a non-JSON reply is shown as free **uncited prose**; a valid id is not checked against the claim, so invented numbers pass. | `matchlab/world.py:381-410`, `web/dash.js:1798-1802` |
| M-12 | Contrast | Chocolate: `tag.live` 3.37:1, `tag.ok` 3.3:1, down pills 3.4–4.1:1, `f1-label` 3.8:1. Butter: chip counts 3.62:1. Divider glyph in the utility bar 1.3–3.1:1 in all themes. | `before/contrast.json` |
| M-13 | Responsive | Formula 1 view overflows horizontally at 360 px (scroll width 391). | `before/log.json` |
| M-14 | Stale data | "Last checked 4:30 PM" is static text: no age, no warning when the schedule is old, and the budget chips never show when a feed last succeeded. Failures appear as a plain note. | `web/dash.js:195-199`, `web/dash.js:80-90` |

## Minor

| ID | Finding | Where |
|---|---|---|
| m-1 | Fonts: `font-display: swap` with a generic system fallback that is not metric-matched; no preload. | `web/dash.css:1-4`, `web/dash.html` |
| m-2 | Static path guard uses a string prefix (`startswith`) instead of a path-relative check. | `app.py:483` |
| m-3 | Track record table shows favourite percentages and hit rates without n beside them; there is no calibration view; the sport chip counts mean "saved" while the figures mean "graded". | `web/dash.js:711-748` |
| m-4 | Both team colours on win bars differ only by hue (blue vs brown); the label order carries meaning but the colour alone is the key. | `web/dash.css:258` |
| m-5 | Market terminal hard-codes "EST" next to a locale-formatted time; `as_of` is not an EST value. | `web/dash.js:1278` |
| m-6 | `public/` duplicates `web/` for the cloud deployment and can drift (already differs in `app.js`). | `public/` |
| m-7 | The World briefing generates automatically when the tab opens if a key exists, spending the OpenRouter quota without a click. It is budget-gated, so the limit holds, but it is a spend the reader did not ask for. | `web/dash.js:1815-1822` |
| m-8 | `start.ps1` serves on 8766 but `app.py` defaults to 8765. | `start.ps1`, `app.py:703` |

## What already works (keep)

No console errors or CSP violations in any view. Skip link, labelled search, pressed-state chips, 44 px buttons and
visible focus exist. Theme choice persists. Text from feeds is inserted with `textContent` / `createTextNode`.
The `saved_before_start` rule is applied by the backend and shown as "Opened after start".
