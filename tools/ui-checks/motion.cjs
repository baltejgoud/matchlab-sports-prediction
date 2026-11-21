// Usage: node motion.cjs [base]  -> JSON report of animated properties, infinite animations, reduced-motion behaviour
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8766';
const BANNED = /^(width|height|top|left|right|bottom|margin|padding|all|max-width|max-height|min-width|min-height|font-size|inset)/;
const scan = () => {
  const bad = { transitions: [], keyframes: [], willChange: 0, easings: new Set() };
  const walk = (rules) => {
    for (const r of rules) {
      if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules);
      if (r instanceof CSSKeyframesRule) {
        const props = new Set();
        for (const k of r.cssRules) for (let i = 0; i < k.style.length; i++) props.add(k.style[i]);
        const hit = [...props].filter((p) => /^(width|height|top|left|right|bottom|margin|padding|inset)/.test(p));
        if (hit.length) bad.keyframes.push(`${r.name}: ${hit.join(',')}`);
      } else if (r.style) {
        const tp = r.style.transitionProperty;
        if (tp && tp !== 'all' || r.style.getPropertyValue('transition').includes('all')) {
          const parts = (tp || '').split(',').map((s) => s.trim());
          if (r.style.getPropertyValue('transition').match(/(^|,)\s*all\b/) || parts.some((p) => BANNED.test(p))) bad.transitions.push(`${r.selectorText} { ${r.style.getPropertyValue('transition').slice(0, 90)} }`);
        } else if (tp === 'all' && r.style.getPropertyValue('transition')) bad.transitions.push(`${r.selectorText} {transition: all}`);
        if (r.style.willChange && r.style.willChange !== 'auto') bad.willChange++;
        for (const prop of ['transition', 'animation']) { const v = r.style.getPropertyValue(prop); const m = v.match(/(cubic-bezier\([^)]*\)|ease-in-out|ease-out|ease-in|\bease\b|\blinear\b)/g); if (m) m.forEach((x) => bad.easings.add(x)); }
      }
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch (e) { /* cross-origin */ } }
  bad.easings = [...bad.easings];
  return bad;
};
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const out = {};
  for (const reduced of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    for (const [name, hash] of [['matches', '#matches'], ['world', '#world'], ['record', '#record'], ['f1', '#f1'], ['match', null]]) {
      await page.goto(base + '/' + (hash || '#matches'));
      await page.waitForTimeout(3000);
      if (!hash) { await page.locator('.match-card').first().click(); await page.waitForTimeout(8000); } else if (name !== 'matches') await page.waitForTimeout(4000);
      const r = await page.evaluate(() => {
        const anims = document.getAnimations();
        const running = anims.filter((a) => a.playState === 'running');
        const inf = anims.filter((a) => a.effect && a.effect.getTiming().iterations === Infinity);
        const names = {};
        for (const a of inf) { const n = a.animationName || a.transitionProperty || 'script'; names[n] = (names[n] || 0) + 1; }
        return { total: anims.length, running: running.length, infinite: inf.length, infiniteNames: names };
      });
      out[`${reduced ? 'reduced' : 'normal'}/${name}`] = r;
    }
    if (!reduced) out.static = await page.evaluate(scan);
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})();
