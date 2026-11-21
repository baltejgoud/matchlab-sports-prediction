# World Pulse: design

Approved 2026-11-21. A new **World** tab in the local dashboard, plus a fix for the Formula 1 dropdowns.

## What it shows
1. **Markets**: Anthropic (Nasdaq: ANT, listed 19 Nov 2026) with a five-session chart, plus NVDA, GOOGL, AMZN and MSFT for context. Yahoo Finance chart endpoint; may be delayed; not investment advice.
2. **AI briefing**: one short briefing written by a free OpenRouter model from the items already on screen.
3. **Model releases**: OpenRouter's public model catalogue, newest first. The date is when a model was *listed*, so the UI says "Newly listed", never "released".
4. **AI news**: OpenAI, Google DeepMind, Hugging Face, TechCrunch, The Verge, Google News (Anthropic coverage and model launches) and Hacker News. Filter chips by lab.
5. **Sports headlines**: cricket (ESPNcricinfo, BBC), football and tennis and F1 (ESPN, BBC), with sport filters.

## Architecture
- `matchlab/world.py`: pure parsing, lab classification, merge/dedupe, in-memory `Cache` with per-section TTL and stale fallback (`serve`), briefing prompt, `parse_brief` validation and `BriefStore` (disk).
- `tools/fetch_world.py`: the only network code. A short-lived worker (the server keeps its offline guard). Sources are read in parallel and failures are isolated per source.
- `app.py` and `api/index.py`: `GET /api/world?section=markets|news|models|sports[&refresh=1]`, `GET/POST /api/world-brief`.
- `web/dash.js` / `dash.css`: `renderWorld`. Each panel loads independently and has its own loading, error and stale states.

TTLs: markets 5 min, news 15 min, models 30 min, sports 15 min. A forced refresh is honoured at most every 30 s.

## Safety and cost rules
- Feed text is untrusted: stripped to plain text, links must be http(s), XML declaring entities is rejected, text is inserted with `textContent`, links open with `rel="noopener noreferrer"`.
- The briefing is grounded: every bullet must cite item ids that were supplied, and bullets citing nothing real are dropped. Free models only (`openrouter/free`, price capped at $0).
- Metering: one OpenRouter request per briefing through `budget.spend` (non-priority, so the pre-match reserve is kept). A briefing is reused for 3 hours; a manual refresh needs 10 minutes since the last one. It is saved to `data/local/cache/world_brief.json`.
- No new external runtime assets: the page keeps the existing CSP (`connect-src 'self'`); charts are inline SVG.

## Formula 1 dropdowns
- Dashboard: the lap-analysis select listed only two races in unstyled browser chrome. It now lists the full season in Completed and Upcoming groups with round and date, styled with Astryx tokens (44px, theme-aware chevron, visible focus).
- `/lab`: the Grand Prix select is grouped Completed / Upcoming by date with dates in the labels.

## Not done / known limits
- Yahoo's chart endpoint is unofficial; if it changes, the Markets panel shows an error card and the rest of the page keeps working.
- No Anthropic RSS feed exists, so Anthropic news comes from Google News coverage plus the other feeds.
