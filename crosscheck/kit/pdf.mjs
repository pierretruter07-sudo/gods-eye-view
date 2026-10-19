import { createRequire } from 'node:module'; const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const [inp, out, title] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('file://' + inp, { waitUntil: 'load' }); await p.waitForTimeout(400);
await p.pdf({ path: out, format: 'A4', landscape: true, printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font:7pt Helvetica,Arial;color:#6a7889;padding:0 14mm;display:flex;justify-content:space-between"><span>${title}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' } });
await b.close(); console.log('pdf', out);
