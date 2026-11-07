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
    const page = await sessionPage(browser, 'PHARMACIST', fixture.pharmacist, fixture.pharmacist_token);
    async function send(method, path, token, data, isMultipart = false) {
      const response = await page.request.fetch(new URL('/api' + path, api).href, {
        method, headers: { Authorization: `Bearer ${token}` }, ...(isMultipart ? { multipart: data } : { data }),
      });
      if (!response.ok()) throw Error(`${path} returned ${response.status()} ${await response.text()}`);
      return response;
    }
    await send('PUT', '/dispensing/setup', fixture.access_token, { enabled: true, physical_records_confirmed: true });
    await send('PUT', `/dispensing/pharmacists/${fixture.pharmacist}`, fixture.access_token, {
      registration_number: 'QA-PHARMACIST', registration_authority: 'QA Council', verified_original: true, active: true,
    });
    const customerResponse = await send('POST', '/customers', fixture.access_token, {
      name: 'QA Browser Patient', phone: '9876545566', address: 'QA Patient Address',
    });
    const customer = (await customerResponse.json()).data;
    const created = await send('POST', '/prescriptions', fixture.pharmacist_token, {
      patient_id: customer.id, doctor_name: 'QA Browser Doctor', doctor_registration_number: 'QA-RMP',
      doctor_address: 'QA Doctor Address', written_date: '2026-01-01', external_rx_number: 'QA-BROWSER-RX',
      items_json: JSON.stringify([{ raw_text: 'QA Browser FEFO', prescribed_name: 'QA Browser FEFO',
        matched_product_id: fixture.med, prescribed_quantity: 1, dose_text: 'Synthetic written instructions' }]),
      file: { name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nsynthetic signed prescription') },
    }, true);
    const rx = (await created.json()).data;
    await send('POST', `/prescriptions/${rx.id}/verify`, fixture.pharmacist_token, {});
    await openDrawer(page);
    await page.getByPlaceholder('Search a medicine or scan its barcode').fill('QA Browser FEFO');
    await page.getByRole('option', { name: /QA Browser FEFO/ }).click();
    await page.getByLabel('Find customer by phone or name').fill('9876545566');
    await page.getByText('QA Browser Patient', { exact: true }).first().click();
    await page.getByLabel('Prescription for this patient').selectOption(rx.id);
    await page.getByRole('checkbox', { name: /checked the dated/ }).check();
    await page.getByLabel('Signed prescription register entry').fill('RX-BOOK-1');
    await page.getByLabel('Separate Schedule H1 register entry').fill('H1-BOOK-1');
    await page.getByRole('checkbox', { name: /signed the applicable register/ }).check();
    const saleResponse = page.waitForResponse(response => response.url() === new URL('/api/sales', api).href && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirm sale', exact: true }).first().click();
    const sold = await saleResponse;
    assert.equal(sold.status(), 201);
    const sale = (await sold.json()).data;
    const html = await send('GET', `/sales/${sale.id}/invoice`, fixture.pharmacist_token);
    const invoice = await html.text();
    for (const text of ['Tax invoice', 'QA-PHARMACIST', 'QA Browser Doctor', 'QA Manufacturer', '300490', 'CGST', 'SGST']) assert(invoice.includes(text), text);
    await page.goto(new URL('/reports', web).href);
    await page.getByLabel('Pharmacy report').selectOption('schedule-h1');
    await page.getByRole('button', { name: 'Preview pharmacy report' }).click();
    await page.getByRole('cell', { name: 'H1-BOOK-1', exact: true }).waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    const csv = await downloadPromise;
    assert.match(csv.suggestedFilename(), /^schedule-h1-/);
    console.log('PASS: registered pharmacist selected a verified prescription, supplied H1, rendered the tax invoice, and downloaded the register in Chrome.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
