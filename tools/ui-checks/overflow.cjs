const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const hashes = process.argv.slice(2).length ? process.argv.slice(2) : ['#f1'];
  const page = await (await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' })).newPage();
  for (const hash of hashes) {
    await page.goto('http://127.0.0.1:8766/' + hash); await page.waitForTimeout(hash === '#matches' ? 3000 : 9000);
    const r = await page.evaluate(() => { const iw = innerWidth; const bad = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.right > iw + 1 && b.width > 0 && !e.closest('.scroll,.lap-table,.ticker-marquee-wrap'); }).slice(0, 6).map((e) => e.tagName + '.' + String(e.className).slice(0, 40) + ' right=' + Math.round(e.getBoundingClientRect().right)); return { sw: document.documentElement.scrollWidth, iw, bad }; });
    console.log(hash, JSON.stringify(r));
  }
  await browser.close();
})();
