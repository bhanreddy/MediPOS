// Run with Vite and Playwright. All application API calls use an isolated adapter.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixtures = process.env.INVOICE_FIXTURES || path.resolve(__dirname, '../fixtures/invoice-files');
const output = process.env.INVOICE_QA_OUTPUT || path.resolve(__dirname, '../../../tmp/invoice-import');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `${process.env.VITE_URL || 'http://127.0.0.1:8087'}/tests/fixtures/invoice-import.html`;
  const screenshot = name => page.screenshot({ path: path.join(output, name), fullPage: true });
  async function upload(name) {
    await page.goto(url);
    await page.getByLabel('Supplier (F4)').selectOption('22222222-2222-4222-8222-222222222222');
    await page.getByRole('button', { name: 'Import invoice', exact: true }).click();
    await page.getByLabel('Invoice file', { exact: true }).setInputFiles(path.join(fixtures, name));
    await page.getByRole('button', { name: 'Read invoice', exact: true }).click();
  }
  try {
    for (const format of ['csv', 'xlsx', 'pdf']) {
      await upload(`invoice.${format}`);
      await page.getByRole('button', { name: 'Preview & match medicines', exact: true }).waitFor();
      if (format === 'xlsx') await page.getByLabel('Numeric Excel percentages', { exact: true }).selectOption('whole');
      if (format === 'csv') await page.getByRole('button', { name: 'Remember supplier mapping', exact: true }).click();
      await page.getByRole('button', { name: 'Preview & match medicines', exact: true }).click();
      await page.getByText('1 included lines · 0 need attention', { exact: true }).waitFor();
      const useLines = page.getByRole('button', { name: 'Use 1 line in purchase draft', exact: true });
      assert.equal(await useLines.isDisabled(), true);
      assert.equal(await page.getByLabel('Batch, row 2', { exact: true }).inputValue(), '00001');
      assert.equal(await page.getByLabel('Expiry, row 2', { exact: true }).inputValue(), '2099-02-28');
      if (format === 'csv') {
        await page.getByLabel('Paid quantity, row 2', { exact: true }).fill('10+2');
        await page.getByText('1 included lines · 1 need attention', { exact: true }).waitFor();
        assert.equal(await useLines.isDisabled(), true);
        await page.getByLabel('Paid quantity, row 2', { exact: true }).fill('10');
        await page.getByRole('checkbox', { name: /I checked all included lines/ }).check();
        await screenshot('preview-desktop.png');
        await page.setViewportSize({ width: 390, height: 844 });
        await screenshot('preview-mobile.png');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.setViewportSize({ width: 1440, height: 1100 });
      } else await page.getByRole('checkbox', { name: /I checked all included lines/ }).check();
      await useLines.click();
      assert.equal(await page.evaluate(() => window.invoiceTestPurchases.length), 0);
      await page.getByLabel('Supplier invoice number', { exact: true }).fill(`TEST-${format}`);
      await page.getByRole('button', { name: 'Confirm receipt & update stock (F12)', exact: true }).click();
      await page.getByRole('button', { name: 'Purchase saved', exact: true }).waitFor();
      const [payload] = await page.evaluate(() => window.invoiceTestPurchases);
      assert.equal(payload.invoice_import.source_format, format);
      assert.equal(payload.items[0].quantity, 10);
      assert.equal(payload.items[0].free_quantity, format === 'pdf' ? 0 : 2);
      assert.equal(payload.items[0].discount, format === 'pdf' ? 0 : 10);
      assert.equal(payload.items[0].batch_number, '00001');
      console.log(`PASS ${format}: upload, preview, validation, explicit receipt, stock payload`);
    }
    await upload('scan.pdf');
    await page.getByRole('alert').filter({ hasText: 'no selectable text' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Preview & match medicines', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.invoiceTestPurchases.length), 0);
    assert.deepEqual(errors, []);
    console.log('PASS scanned PDF rejection; desktop/mobile layout; no browser exceptions');
  } catch (error) {
    await screenshot('failure.png');
    console.error(await page.locator('body').innerText());
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
