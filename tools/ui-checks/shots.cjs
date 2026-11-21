// Usage: node shots.cjs <outDir> [base]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
const base = process.argv[3] || 'http://127.0.0.1:8766';
fs.mkdirSync(out, { recursive: true });
const WIDTHS = [[360, 800], [768, 1024], [1280, 900], [1920, 1080]];
const VIEWS = [['matches', '#matches'], ['world', '#world'], ['f1', '#f1'], ['record', '#record'], ['settings', '#settings']];
const log = [];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); });
    for (const [name, hash] of VIEWS) {
      await page.goto(base + '/' + hash);
      await page.waitForTimeout(name === 'world' || name === 'f1' || name === 'record' ? 6000 : 2500);
      await page.evaluate(() => document.fonts.ready);
      const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      await page.screenshot({ path: path.join(out, `${name}-${w}.png`), fullPage: true });
      log.push({ view: name, w, overflowX: over.sw > over.iw, sw: over.sw });
    }
    // match detail: first card
    await page.goto(base + '/#matches');
    await page.waitForSelector('.match-card');
    await page.locator('.match-card').first().click();
    await page.waitForTimeout(9000);
    await page.screenshot({ path: path.join(out, `match-detail-${w}.png`), fullPage: true });
    log.push({ view: 'match-detail', w, errs: errs.slice(0, 10) });
    await ctx.close();
  }
  // theme sweep at 1280
  for (const theme of ['butter', 'neutral', 'chocolate']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem('matchlab-astryx-theme', t), theme);
    for (const [name, hash] of [['matches', '#matches'], ['record', '#record'], ['settings', '#settings']]) {
      await page.goto(base + '/' + hash);
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(out, `theme-${theme}-${name}.png`), fullPage: false });
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
  console.log(JSON.stringify(log));
})();
