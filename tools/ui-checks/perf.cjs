const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8766';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const out = [];
  for (const label of ['cold', 'warm']) {
    const t0 = Date.now();
    if (label === 'cold') await page.goto(base + '/#matches'); else await page.reload();
    await page.waitForSelector('.match-card');
    const firstCard = Date.now() - t0;
    await page.waitForTimeout(1500);
    const res = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => !r.name.includes('refresh-today')).map((r) => ({ n: r.name.split('/').pop().split('?')[0], kb: +(r.transferSize / 1024).toFixed(1), decoded: +(r.decodedBodySize / 1024).toFixed(1) })));
    const total = res.reduce((s, r) => s + r.kb, 0);
    out.push({ label, firstCardMs: firstCard, transferKB: +total.toFixed(1), biggest: res.sort((a, b) => b.kb - a.kb).slice(0, 4) });
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
