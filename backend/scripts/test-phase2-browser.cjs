const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const api = new URL(process.env.QA_API_URL || 'http://127.0.0.1:55601');
const web = new URL(process.env.QA_WEB_URL || 'http://127.0.0.1:4179');
if ([api, web].some(url => !['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('Browser QA requires localhost');
const fixture = JSON.parse(fs.readFileSync(process.env.QA_AUTH_FILE, 'utf8'));

async function sessionPage(browser, role, id, accessToken) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 990 } });
  const email = `${role.toLowerCase()}@example.invalid`;
  const session = {
    access_token: accessToken, refresh_token: 'local-qa-refresh', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id, email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
  const profile = { id, clinic_id: fixture.clinic, role, full_name: `QA ${role}`, email };
  await context.addInitScript(({ session, profile }) => {
    if (!localStorage.getItem('supabase_session_json')) {
      localStorage.setItem('supabase_session_json', JSON.stringify(session));
      localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
      localStorage.setItem('auth_profile_json', JSON.stringify(profile));
    }
  }, { session, profile });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol), route => route.abort());
  const page = await context.newPage();
  await page.goto(new URL('/billing/new', web).href);
  return page;
}

async function openDrawer(page) {
  await page.getByRole('button', { name: 'Cash register', exact: true }).click();
  await page.getByLabel('Opening float (₹)').fill('100');
  await page.getByRole('button', { name: 'Open shift', exact: true }).click();
  await page.getByRole('heading', { name: 'X report', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close dialog' }).click();
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const cashier = await sessionPage(browser, 'CASHIER', fixture.cashier, fixture.cashier_token);
    await openDrawer(cashier);
    await cashier.getByPlaceholder('Search a medicine or scan its barcode').fill('QA Browser FEFO');
    await cashier.getByRole('option', { name: /QA Browser FEFO/i }).click();
    await cashier.getByRole('button', { name: 'Change batch' }).click();
    await cashier.getByRole('button', { name: /QA-LATER/ }).click();

    await cashier.getByRole('button', { name: 'Park bill', exact: true }).click();
    await cashier.getByText(/Bill parked/).waitFor();
    await cashier.getByRole('button', { name: 'Parked bills', exact: true }).click();
    await cashier.getByRole('searchbox', { name: 'Search parked bills' }).fill('P001');
    await cashier.getByRole('button', { name: 'Resume bill', exact: true }).click();
    await cashier.getByText('Resumed P001').waitFor();
    await cashier.getByRole('textbox', { name: 'Quantity of QA Browser FEFO' }).fill('2');
    await cashier.getByRole('spinbutton', { name: 'Item discount for QA Browser FEFO' }).fill('20');
    await cashier.getByLabel('Discount reason').fill('Browser promotion');
    await cashier.getByRole('button', { name: 'Request owner approval' }).click();
    await cashier.getByText('Awaiting owner').waitFor();

    const owner = await sessionPage(browser, 'OWNER', fixture.owner, fixture.access_token);
    await openDrawer(owner);
    await owner.getByRole('button', { name: 'Discount approvals', exact: true }).click();
    await owner.getByRole('button', { name: 'Approve discount', exact: true }).click();
    await owner.getByText('Approved', { exact: true }).waitFor();
    await cashier.getByRole('button', { name: 'Refresh approvals' }).click();
    await cashier.getByRole('button', { name: 'Apply approval to current bill' }).click();

    await cashier.getByRole('radio', { name: 'Split', exact: true }).click();
    await cashier.getByLabel('Amount 1 (₹)').fill('7.20');
    await cashier.getByLabel('Amount 2 (₹)').fill('12');
    await cashier.getByLabel('Reference 2').fill('QA-SPLIT-UPI');
    const saleRequest = cashier.waitForResponse(response => response.url() === new URL('/api/sales', api).href && response.request().method() === 'POST');
    await cashier.getByRole('button', { name: 'Confirm sale', exact: true }).first().click();
    const posted = await saleRequest;
    const sale = (await posted.json()).data;
    assert.equal(posted.status(), 201);
    assert.equal(Number(sale.net_amount), 19.2);
    assert.equal(sale.sale_items[0].batch_id, fixture.batches[1]);
    assert.equal(sale.payment_transactions.find(row => row.tender_type === 'UPI').reference_number, 'QA-SPLIT-UPI');

    await cashier.getByRole('button', { name: 'Cash register · Open', exact: true }).click();
    await cashier.getByLabel('Register action').selectOption('close');
    await cashier.getByLabel('Closing cash count (₹)').fill('107.20');
    await cashier.getByRole('button', { name: 'Close shift', exact: true }).click();
    await cashier.getByRole('heading', { name: 'Z report', exact: true }).waitFor();
    assert.match(await cashier.getByRole('region', { name: 'Register reconciliation' }).innerText(), /Expected cash\s+₹107\.20/);

    await owner.goto(new URL('/billing', web).href);
    await owner.getByRole('textbox', { name: 'Search invoices' }).fill(sale.invoice_number);
    await owner.getByRole('button', { name: `Void invoice ${sale.invoice_number}` }).click();
    await owner.getByLabel('Cancellation reason').fill('Browser QA cancellation');
    await owner.getByRole('checkbox', { name: /Restore stock/ }).check();
    await owner.getByRole('button', { name: 'Approve and void invoice' }).click();
    await owner.getByText(/Invoice voided/).waitFor();
    const response = await owner.request.get(new URL(`/api/sales/${sale.id}`, api).href, { headers: { Authorization: `Bearer ${fixture.access_token}` } });
    const detail = (await response.json()).data;
    assert.equal(detail.void_record.reason, 'Browser QA cancellation');
    assert.equal(detail.invoice_number, sale.invoice_number);
    console.log('PASS: open and close drawer, park and edit, manual batch, owner discount approval, Cash + UPI, and invoice void through Chrome.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
