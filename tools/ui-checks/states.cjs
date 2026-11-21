// node states.cjs <outDir>  : exercises loading, empty, stale and error states through route stubs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs'); const path = require('path');
const base = 'http://127.0.0.1:8766'; const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const real = JSON.parse(fs.readFileSync('data/today_matches.json', 'utf8'));
const results = []; const check = (n, ok, x) => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  async function run(name, w, setup, after) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await setup(page); await page.goto(base + '/#matches');
    const r = await after(page);
    await page.screenshot({ path: path.join(out, `state-${name}-${w}.png`), fullPage: false });
    if (errs.length) check(name + ' has no page errors', false, errs);
    await ctx.close(); return r;
  }
  const sched = (patch) => ({ ...real, ...patch, budget: real.budget });
  const stub = (body, delay = 0, status = 200) => async (route) => { if (delay) await new Promise((r) => setTimeout(r, delay)); await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); };
  for (const w of [360, 1280]) {
    // loading: today-matches delayed
    await run('loading', w, async (p) => { await p.route('**/api/today-matches', stub(sched({}), 2500)); }, async (p) => { await p.waitForTimeout(600); const t = await p.locator('#view').innerText(); check(`loading copy visible @${w}`, /Loading your matchday/.test(t), t.slice(0, 40)); });
    // empty
    await run('empty', w, async (p) => { const e = { date: '', sports: { cricket: [], tennis: [], f1: [] }, total_matches: 0, sources: [], last_updated: new Date().toISOString(), budget: real.budget }; await p.route('**/api/today-matches', stub(e)); await p.route('**/api/refresh-today-matches', stub(e)); }, async (p) => { await p.waitForTimeout(1200); const t = await p.locator('#view').innerText(); check(`empty copy @${w}`, /quiet moment/i.test(t) && /No upcoming fixtures/i.test(t), t.match(/A quiet[^\n]*/)?.[0]); });
    // stale: 3 hours old and refresh fails
    await run('stale', w, async (p) => { const old = sched({ last_updated: new Date(Date.now() - 3 * 3600e3).toISOString() }); await p.route('**/api/today-matches', stub(old)); await p.route('**/api/refresh-today-matches', stub({ error: 'Schedule update timed out after 60 seconds' }, 0, 500)); }, async (p) => { await p.waitForTimeout(1500); const chip = await p.locator('.freshness').first().textContent(); const cls = await p.locator('.freshness').first().getAttribute('class'); const note = await p.locator('.note.error').first().textContent().catch(() => ''); check(`stale chip says old @${w}`, /out of date/.test(chip) && /old/.test(cls), { chip, note }); check(`feed failure is actionable @${w}`, /Try Refresh again/.test(note), note); });
    // server down
    await run('down', w, async (p) => { await p.route('**/api/session', (r) => r.abort()); }, async (p) => { await p.waitForTimeout(800); const t = await p.locator('#view').innerText(); check(`server-down message @${w}`, /could not start/.test(t) && /Try again/.test(t), t.slice(0, 120)); });
  }
  await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
})();
