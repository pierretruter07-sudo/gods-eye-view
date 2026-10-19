import { createRequire } from 'node:module'; const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', String(e))); p.on('console', (m) => console.log('LOG', m.type(), m.text()));
await p.goto('file://' + process.cwd() + '/cc-preview.html'); await p.waitForTimeout(500);
console.log(await p.evaluate(() => [localStorage.getItem('ed153-assessor-local')?.slice(0, 80), document.querySelector('#main').textContent.slice(0, 200)]));
await b.close();
