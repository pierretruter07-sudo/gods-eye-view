import { createRequire } from 'node:module'; const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
import fs from 'node:fs';
const html = fs.readFileSync('crosscheck.html', 'utf8');
const seed = JSON.parse(fs.readFileSync('gev-seed.crosscheck.json', 'utf8'));
const pre = `<script>try{localStorage.setItem('ed153-assessor-local', JSON.stringify([['gev-example', ${JSON.stringify(seed).replace(/<\//g, '<\\/')}]]))}catch(e){}</script>`;
fs.writeFileSync('cc-preview.html', `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${pre}${html}</body></html>`);
const b = await chromium.launch(); const errors = [];
for (const [w, scheme] of [[1280, 'light'], [400, 'dark']]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 }, colorScheme: scheme });
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto('file://' + process.cwd() + '/cc-preview.html'); await p.waitForTimeout(300);
  await p.click('[data-tab=evidence]'); await p.waitForTimeout(150);
  await p.screenshot({ path: `ev-top-${w}.png`, fullPage: false });
  await p.click('details[data-ev="v:1"] > summary'); await p.click('details[data-ev="w:W1"] > summary'); await p.click('details[data-ev="f:V3.4.3"] > summary');
  await p.waitForTimeout(150);
  await p.locator('details[data-ev="f:V3.4.3"]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `ev-drill-${w}.png`, fullPage: false });
  if (w === 1280) {
    // log a change: open in security tab, add evidence, rate C
    await p.click('[data-goto="V3.4.3"]'); await p.waitForTimeout(150);
    await p.fill('article[data-id="V3.4.3"] input[data-r="evidence"]', 'commit abc1234 · test csp.test.mjs');
    await p.click('article[data-id="V3.4.3"] button[data-s="C"]');
    await p.click('[data-tab=evidence]'); await p.waitForTimeout(150);
    const txt = await p.locator('details[data-ev="f:V3.4.3"] .hist').innerText();
    console.log('HIST:', txt.replace(/\n/g, ' | '));
    console.log('PROG:', await p.locator('.ba .sheet').nth(2).innerText());
    await p.fill('#ra-label', 'Check re-audit'); await p.click('[data-act=reaudit]'); await p.waitForTimeout(100);
    console.log('AUDITS rows:', await p.locator('.reg tbody tr').count());
  }
  console.log(w, 'overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
}
console.log('errors', errors); await b.close();
