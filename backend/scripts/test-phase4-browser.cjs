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


(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const pharmacist = await sessionPage(browser, 'PHARMACIST', fixture.pharmacist, fixture.pharmacist_token);
    const selector = pharmacist.getByRole('combobox', { name: 'Active branch', exact: true });
    await selector.waitFor();
    assert.equal(await selector.inputValue(), fixture.store);
    await pharmacist.getByPlaceholder('Search a medicine or scan its barcode').fill('QA Browser FEFO');
    await pharmacist.getByRole('option', { name: /QA Browser FEFO/i }).click();
    await pharmacist.getByRole('button', { name: 'Check sister stores' }).click();
    await pharmacist.getByText('QA West Branch', { exact: true }).last().waitFor();
    await pharmacist.getByRole('button', { name: 'Request from QA West Branch' }).click();
    await pharmacist.getByRole('button', { name: 'Send transfer request' }).click();
    await pharmacist.getByText(/Stock becomes available after receipt/).waitFor();
    await pharmacist.getByRole('button', { name: 'Close dialog' }).click();
    await pharmacist.getByRole('button', { name: 'Park bill', exact: true }).click();
    await pharmacist.getByText(/Bill parked/).waitFor();

    await Promise.all([pharmacist.waitForEvent('domcontentloaded'), selector.selectOption(fixture.sister)]);
    await pharmacist.getByPlaceholder('Search a medicine or scan its barcode').waitFor();
    assert.equal(await selector.inputValue(), fixture.sister);
    const search = pharmacist.waitForResponse(response => response.url().includes('/api/inventory/medicines/search?'));
    await pharmacist.getByPlaceholder('Search a medicine or scan its barcode').fill('QA Browser FEFO');
    const result = (await (await search).json()).results[0];
    assert.equal(Number(result.total_stock), 10);
    assert.deepEqual(result.medicine_batches.map(batch => batch.batch_number), ['QA-LATER']);
    await pharmacist.reload();
    await selector.waitFor();
    assert.equal(await selector.inputValue(), fixture.sister);

    const cashier = await sessionPage(browser, 'CASHIER', fixture.cashier, fixture.cashier_token);
    const cashierSelector = cashier.getByRole('combobox', { name: 'Active branch', exact: true });
    await cashierSelector.waitFor();
    const cashierBranches = cashierSelector.locator('option');
    assert.deepEqual(await cashierBranches.allTextContents(), ['QA Store']);
    const forged = await cashier.request.get(new URL('/api/register/active', api).href, {
      headers: { Authorization: `Bearer ${fixture.cashier_token}`, 'x-store-id': fixture.sister },
    });
    assert.equal(forged.status(), 403);
    console.log('PASS: authorized branch switch persists, stock changes with the branch, a sister-store request is recorded, and an unauthorized branch is denied.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
