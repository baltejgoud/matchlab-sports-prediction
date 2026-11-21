// Usage: node contrast.cjs <outJson> [base]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const base = process.argv[3] || 'http://127.0.0.1:8766';
const PAGES = [['matches', '#matches'], ['match', null], ['world', '#world'], ['f1', '#f1'], ['record', '#record'], ['settings', '#settings']];
const probe = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { // composite ancestors; flag image/gradient backgrounds as unknown
    const chain = []; let unknown = false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') unknown = true;
      const c = rgba(cs.backgroundColor); if (c[3] > 0) { chain.push(c); if (c[3] === 1) break; }
    }
    let bg = [255, 255, 255, 1]; for (const c of chain.reverse()) bg = over(c, bg); return { bg, unknown };
  };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t; (t = walker.nextNode());) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0 || el.closest('.vh,[hidden]')) continue;
    const op = (() => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; })();
    const { bg, unknown } = bgOf(el);
    const fg0 = rgba(cs.color); const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5; const cr = ratio(fg, bg);
    if (cr < need) out.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), text: t.textContent.trim().slice(0, 40), cr: +cr.toFixed(2), need, size, unknown, fg: fg.map(Math.round).join(','), bg: bg.map(Math.round).join(',') });
  }
  return out;
};
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const result = {};
  for (const theme of ['butter', 'neutral', 'chocolate']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem('matchlab-astryx-theme', t), theme);
    for (const [name, hash] of PAGES) {
      await page.goto(base + '/' + (hash || '#matches'));
      await page.waitForTimeout(2500);
      if (name === 'match') { await page.locator('.match-card').first().click(); await page.waitForTimeout(8000); }
      else if (name === 'world' || name === 'f1' || name === 'record') await page.waitForTimeout(5000);
      const fails = await page.evaluate(probe);
      const grouped = {};
      for (const f of fails) { const k = f.sel + '|' + f.fg + '|' + f.bg; (grouped[k] = grouped[k] || { ...f, count: 0 }).count++; }
      result[`${theme}/${name}`] = Object.values(grouped).sort((a, b) => a.cr - b.cr);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 1));
  for (const [k, v] of Object.entries(result)) console.log(k, v.length, 'distinct failing styles;', v.slice(0, 3).map((x) => `${x.sel} ${x.cr}${x.unknown ? '?' : ''}`).join(' | '));
})();
