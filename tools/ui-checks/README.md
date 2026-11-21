# UI checks

Browser checks used for the UI quality pass. They drive a running MatchLab (`python app.py --port 8766`) and
only read from it. They need Playwright (`npm i playwright`), or set `PLAYWRIGHT_PATH` to an install, and
optionally `CHROMIUM_PATH`.

| Script | Checks |
|---|---|
| `shots.cjs <dir>` | Screenshots of every view at 360, 768, 1280 and 1920 px, three themes, overflow and console errors |
| `contrast.cjs <json>` | WCAG contrast of every text node in all three themes (text over photos is reported as unknown) |
| `motion.cjs` | Animated properties, infinite animations, reduced-motion behaviour |
| `morph.cjs` | Focus, node identity, open sections and animations across search, filters and polls |
| `states.cjs <dir>` | Loading, empty, stale and server-down states through route stubs (run from the repo root) |
| `overflow.cjs <hashes>` | Horizontal overflow at 360 px |
| `perf.cjs` | Cold and warm load transfer and time to first card |
