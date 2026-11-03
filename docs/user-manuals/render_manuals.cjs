const { chromium } = require('/Users/bhanureddy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    for (const edition of ['english', 'telugu', 'hybrid']) {
      const page = await browser.newPage();
      await page.goto('file://' + path.join(__dirname, `medpos-user-manual-${edition}.html`));
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.locator('.sheet').evaluateAll(sheets => sheets.map((sheet, i) => {
        const note = sheet.querySelector('.note').getBoundingClientRect();
        const footer = sheet.querySelector('.footer').getBoundingClientRect();
        return { page: i+1, gapToFooter: Math.round(footer.top - note.bottom), overflow: sheet.scrollHeight > sheet.clientHeight };
      }));
      if (layout.some(p => p.gapToFooter < 12 || p.overflow)) throw new Error(`${edition}: layout overflow: ${JSON.stringify(layout)}`);
      await page.pdf({ path: path.join(root, 'output/pdf', `medpos-user-manual-${edition}.pdf`), printBackground: true, preferCSSPageSize: true, tagged: true });
      console.log(edition, JSON.stringify(layout));
      await page.close();
    }
  } finally { await browser.close(); }
})();
