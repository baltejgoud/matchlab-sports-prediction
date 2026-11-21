# MatchLab improvement plan

Companion to `docs/ui-audit.md` (IDs refer to it). Ordered by impact over effort. One concern per commit, on
branch `ui-quality-pass`. `web/` is the source; `public/dash.*` is mirrored in the same commit so the Vercel copy
does not drift. No change here touches `matchlab/` model math, iteration counts, `budget.py`, the AI-check cap or the
`saved_before_start` logic.

Verification used for every item: full unittest suite, browser console and CSP check, and the item's own check
below. Motion and contrast items are re-measured with the same scripts as the audit.

| # | Area | Problem | Fix (deciding specialist) | Files | Risk | Verify |
|---|---|---|---|---|---|---|
| 1 | Honesty | C-1, C-2: invented market data and random price flicker | Delete order flow, bid/ask/spread, beta, synthetic candles and volume, non-functional timeframes, mislabelled SMAs and the random ticker. Keep real quote, real close series, day and range stats. *PM + ML: a number with no source is worse than no number.* | `web/dash.js`, `web/dash.css` | Low: pure removal; terminal gets simpler | Grep for removed symbols; World screenshot; console clean |
| 2 | Honesty | C-3: hard-coded 2024 F1 grid | Remove the panel; the live constructor standings table already covers it. *PM: scope discipline.* | `web/dash.js` | Low | F1 view renders; no `F1_GRID_CARS` |
| 3 | Track record | C-6, m-3: headline count mixes excluded forecasts, no n or uncertainty | Separate "counted" (saved before start) from "opened after start (not counted)", show n beside every rate, add a Wilson 95% range, rewrite overclaiming copy. *ML: with n≈9 a point estimate alone misleads.* | `web/dash.js` | Low: presentation only | Numbers reconcile with the table; screenshot |
| 4 | Accessibility | C-4: page-wide `aria-live`, no focus move | Remove live region from `<main>`; add one visually hidden polite status node; move focus to the view heading on route change; announce a score change only when it changes. *UX + FE.* | `web/dash.html`, `web/dash.js`, `web/dash.css` | Medium: focus behaviour | Playwright: nothing announced on poll; focus lands on h1 |
| 5 | Back end | M-1, M-2, m-2: 3.6 MB gate request, `no-store` on assets, prefix path guard | New `/api/session` (token + key status only); ETag and `Cache-Control` for static files (API stays `no-store`); `is_relative_to` guard. All security headers and the CSP stay byte-identical. *BE.* | `app.py`, `web/dash.js`, `tests/` | Medium: caching can serve stale JS; mitigated by `no-cache` + ETag for html/js/css | New tests: headers, 304, traversal; first paint timing |
| 6 | Images | M-3: 800 KB image for a 38 px thumbnail, misleading venue photos | Remove card thumbnails, the duplicate showcase gallery and the generic venue photo; give the remaining photos fixed aspect ratio, `alt=""` (decorative), lazy loading and an error fallback. *UX: an image must carry information.* | `web/dash.js`, `web/dash.css` | Low | Transfer size before and after; broken-image test |
| 7 | Motion | M-4, M-5: layout-property animation, paint-heavy pulse, 60 infinite animations | Pulse becomes a scale and opacity ring on a pseudo-element; remove shimmer and glow loops; no `width`, `left`, `top` transitions; no `transition: all`; drop blanket `will-change`. Existing easing tokens only. *FE wins over the designer's richer pulse.* | `web/dash.css` | Low | `document.getAnimations()` audit; computed `transition-property` scan |
| 8 | Architecture | M-6, M-7: whole-view re-render, replayed animation, no debounce | Keyed DOM patch for same-route updates (keeps focus, scroll, open `<details>`, selects); one-time reveal for counters and bars (`transform`/`opacity` only); in-place value update with a brief highlight only when a value changed; 150 ms search debounce. *FE.* | `web/dash.js`, `web/dash.css` | High: largest change | Poll test: node identity retained; no animation replay; focus survives |
| 9 | Hierarchy | M-9, M-10: live win chance buried, flat 30-card list | Live analysis first when a match is in play; compact hero; cap each section at 12 cards with "Show more". *PM + UX.* | `web/dash.js`, `web/dash.css` | Low | Screenshots at four widths |
| 10 | Typography | m-1: font flash, uneven numerals | Preload the default font, tabular figures on every data element, 68ch measure on prose. Fallback is not metric-matched, so non-default theme fonts stay on `swap`. *FE.* | `web/dash.html`, `web/dash.css` | Low | `document.fonts` status; computed styles |
| 11 | Contrast | C-5, M-12 | Hero text colours; Chocolate local token overrides for tags and pills; chip counts; hide decorative divider. *UX.* | `web/dash.css`, `web/dash.js` | Low | Re-run contrast sweep for all three themes |
| 12 | Stale data | M-14 | Age-based freshness chip (fresh, stale, old) driven by data timestamp, updated in place every 30 s; actionable error copy. *BE + UX.* | `web/dash.js`, `web/dash.css` | Low | Route-stub test with an old timestamp |
| 13 | GenAI | M-11 | Briefing: reject uncited prose, require every number to appear in a cited item, drop an unsupported headline, and show "N statements removed". Cap and budget path unchanged. *GenAI.* | `matchlab/world.py`, `web/dash.js`, `tests/test_world.py` | Medium: stricter parsing may drop more output | Unit tests with adversarial replies |
| 14 | Responsive | M-13 | Fix the 360 px F1 overflow. | `web/dash.css` | Low | Overflow check at four widths |
| 15 | Regression | Constraint 6 | Add a fixed-seed snapshot test if none exists for the simulators. | `tests/` | Low | Suite passes |

## Deliberately not planned

- **Calibration chart.** With 9 graded cricket forecasts a reliability diagram would be noise. The page keeps the
  existing "needs 30 graded forecasts" notice and adds n and an interval instead.
- **Automatic briefing spend (m-7).** Budget-gated, so within constraints; changing it is a product decision for the owner.
- **Re-encoding photographs or `srcset`.** After item 6 the remaining photographs are few and decorative. Re-encoding
  needs an image toolchain that is not in the project.
- **Metric-matched fallback fonts.** Needs measured font metrics for four families; preload plus asset caching
  removes the visible flash for the default theme instead.
- **Changing `public/app.js` or the legacy `/lab` page.**
