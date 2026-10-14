import { createRequire } from 'node:module'; const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
import fs from 'node:fs';
const html = fs.readFileSync('crosscheck.html', 'utf8');
const seed = JSON.parse(fs.readFileSync('gev-seed.crosscheck.json', 'utf8'));
const pre = `<script>try{localStorage.setItem('ed153-assessor-local', JSON.stringify([['gev-example', ${JSON.stringify(seed).replace(/<\//g, '<\\/')}]]))}catch(e){console.error('ls',e)}</script>`;
fs.writeFileSync('cc-preview.html', `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${pre}${html}</body></html>`);
const browser = await chromium.launch();
const errors = [];
for (const [w, scheme] of [[1280, 'light'], [400, 'dark']]) {
  const page = await browser.newPage({ viewport: { width: w, height: 1000 }, colorScheme: scheme });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('file://' + process.cwd() + '/cc-preview.html', { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 400));
  for (const tab of ['security', 'cross', 'report', 'intake']) {
    await page.click(`[data-tab=${tab}]`);
    if (tab === 'security') { await page.selectOption('#sstatus', 'gap'); }
    await new Promise((r) => setTimeout(r, 200));
    await page.screenshot({ path: `cc-${tab}-${w}.png`, fullPage: tab !== 'security' && tab !== 'report' ? true : false });
  }
  const info = await page.evaluate(() => ({ verdicts: [...document.querySelectorAll('.vchip')].map((e) => e.textContent).slice(0, 3), overflow: document.documentElement.scrollWidth - innerWidth }));
  console.log(w, scheme, JSON.stringify(info));
  if (w === 1280) {
    await page.click('[data-tab=report]');
    await new Promise((r) => setTimeout(r, 200));
    await page.screenshot({ path: 'cc-report-full.png', fullPage: true });
  }
}
console.log('errors', errors);
await browser.close();
