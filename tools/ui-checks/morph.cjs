const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8766';
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log(ok ? 'PASS' : 'FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '/#matches');
  await page.waitForSelector('.match-card');
  await page.waitForTimeout(2500);

  // 1. Search keeps the field focused and the cards it keeps are the same nodes; no entrance replay.
  await page.evaluate(() => { window.__first = document.querySelector('.match-card'); window.__input = document.querySelector('.match-search'); window.__text = window.__first.textContent; });
  const firstText = await page.evaluate(() => window.__text.slice(0, 20));
  await page.locator('.match-search').click();
  await page.keyboard.type('e', { delay: 50 });
  await page.waitForTimeout(500);
  const s1 = await page.evaluate(() => ({ sameInput: document.querySelector('.match-search') === window.__input, focused: document.activeElement === window.__input, caret: window.__input.selectionStart, value: window.__input.value, cascade: document.getAnimations().filter((a) => a.playState === 'running' && a.animationName === 'match-card-cascade').length, cards: document.querySelectorAll('.match-card').length }));
  check('search input node and focus survive a render', s1.sameInput && s1.focused && s1.value === 'e', s1);
  check('no card entrance replay on search', s1.cascade === 0, { cascade: s1.cascade });

  // 2. Filter chip keeps focus and does not rebuild the hero.
  await page.evaluate(() => { window.__hero = document.querySelector('.matchday-hero'); });
  await page.locator('.match-search').fill('');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Tennis', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const s2 = await page.evaluate(() => ({ heroSame: document.querySelector('.matchday-hero') === window.__hero, focusText: document.activeElement.textContent, pressed: document.activeElement.getAttribute('aria-pressed'), counting: document.querySelectorAll('[data-countup]').length }));
  check('chip keeps focus, hero retained', s2.heroSame && s2.focusText === 'Tennis' && s2.pressed === 'true', s2);

  // 3. Debounce: five keystrokes in 100 ms cause at most two renders.
  await page.getByRole('button', { name: 'All sports', exact: true }).click();
  await page.evaluate(() => { window.__renders = 0; const orig = window.renderMatches; window.renderMatches = function () { window.__renders++; return orig.apply(this, arguments); }; });
  await page.locator('.match-search').fill('');
  await page.locator('.match-search').pressSequentially('abcde', { delay: 20 });
  await page.waitForTimeout(500);
  const renders = await page.evaluate(() => window.__renders);
  check('search is debounced', renders <= 2, { renders });
  await page.locator('.match-search').fill('');
  await page.waitForTimeout(400);

  // 4. Match page poll patches in place.
  await page.locator('.match-card').first().click();
  await page.waitForSelector('.head h1', { timeout: 120000 });
  await page.waitForFunction(() => /^Updated at|could not be updated/.test(document.getElementById('match-refresh-error')?.textContent || ''), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const open = await page.evaluate(() => { const d = document.querySelector('details.more'); if (d) d.open = true; window.__panel = document.querySelector('.panel'); window.__details = d; window.__status = document.getElementById('status').textContent; window.__h1 = document.querySelector('h1'); return { hasDetails: !!d, hash: location.hash }; });
  await page.evaluate(() => { const id = decodeURIComponent(location.hash.slice(7)); window.__stamp = document.getElementById('match-refresh-error').textContent; window.openMatch(id, true); });
  await page.waitForFunction(() => document.getElementById('match-refresh-error').textContent !== window.__stamp, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  const s4 = await page.evaluate(() => ({ panelSame: document.querySelector('.panel') === window.__panel, h1Same: document.querySelector('h1') === window.__h1, detailsSame: !window.__details || document.contains(window.__details), detailsOpen: !window.__details || window.__details.open, statusSame: document.getElementById('status').textContent === window.__status, revealing: document.getAnimations().filter((a) => a.playState === 'running' && ['bar-reveal', 'match-card-cascade', 'view-enter', 'hero-enter'].includes(a.animationName)).length }));
  check('poll keeps nodes, open details and announces nothing', s4.panelSame && s4.h1Same && s4.detailsSame && s4.detailsOpen && s4.statusSame, { ...open, ...s4 });
  check('poll does not replay bar/enter animations', s4.revealing === 0, { revealing: s4.revealing });

  check('no page errors or console errors', errors.length === 0, errors.slice(0, 5));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
