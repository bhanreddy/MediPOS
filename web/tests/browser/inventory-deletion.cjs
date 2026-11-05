// Run against Vite: PLAYWRIGHT_MODULE=playwright-core node tests/browser/inventory-deletion.cjs
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const fixture = '/tests/fixtures/inventory-deletion.tsx';
    const qa = expression => page.evaluate(async ({ fixture, expression }) => {
        const { qa } = await import(fixture);
        return Function('qa', expression)(qa);
    }, { fixture, expression });
    const dialog = page.getByRole('dialog');
    const next = () => dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    const confirm = () => dialog.getByRole('button', { name: 'Delete medicine', exact: true });
    const open = () => page.getByRole('button', { name: 'Delete medicine Sample medicine', exact: true }).first().click();
    const finalStep = async () => { await next(); await dialog.getByRole('checkbox').check(); await next(); };
    try {
        await page.goto(`${process.env.VITE_URL || 'http://127.0.0.1:8083'}/tests/fixtures/inventory-deletion.html`);
        await page.getByRole('button', { name: 'Delete medicine Sample medicine', exact: true }).first().waitFor();
        assert.equal(await page.getByRole('button', { name: 'Delete medicine Sample medicine', exact: true, includeHidden: true }).count(), 2);

        // Every cancellation route leaves the inventory intact and resets the next attempt.
        await open(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await open(); await next();
        assert.equal(await dialog.getByRole('button', { name: 'Continue', exact: true }).isDisabled(), true);
        await page.keyboard.press('Escape');
        await open(); await finalStep();
        await dialog.getByLabel('Medicine name to confirm').fill('Sample medicine');
        await dialog.getByRole('button', { name: 'Close dialog' }).click();
        assert.equal(await qa('return qa.deleteRequests.length'), 0);

        await open(); await finalStep();
        assert.equal(await dialog.getByLabel('Medicine name to confirm').inputValue(), '');
        assert.equal(await confirm().isDisabled(), true);
        await dialog.getByLabel('Medicine name to confirm').fill('sample medicine');
        assert.equal(await confirm().isDisabled(), true);
        await dialog.getByLabel('Medicine name to confirm').fill('Sample medicine');
        assert.equal(await confirm().isEnabled(), true);
        await dialog.getByRole('button', { name: 'Back', exact: true }).click();
        assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
        await dialog.getByRole('checkbox').check(); await next();
        assert.equal(await dialog.getByLabel('Medicine name to confirm').inputValue(), '');

        // Failure is visible, keeps all rows, and allows a deliberate retry.
        await qa('qa.failNext = true');
        await dialog.getByLabel('Medicine name to confirm').fill('Sample medicine');
        await confirm().click();
        await dialog.getByRole('alert').waitFor();
        assert.match(await dialog.getByRole('alert').innerText(), /Synthetic deletion failure/);
        assert.equal(await page.getByRole('button', { name: 'Delete medicine Sample medicine', exact: true, includeHidden: true }).count(), 2);
        assert.equal(await confirm().isEnabled(), true);

        // A pending request cannot be double-submitted or dismissed.
        await qa('qa.pending = true');
        await confirm().click();
        await page.waitForFunction(async () => (await import('/tests/fixtures/inventory-deletion.tsx')).qa.deleteRequests.length === 2);
        await page.keyboard.press('Escape');
        await dialog.getByRole('button', { name: 'Close dialog' }).click();
        assert.equal(await dialog.count(), 1);
        assert.equal(await dialog.getByRole('button', { name: 'Processing' }).isDisabled(), true);
        await qa('qa.release()');
        await dialog.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Delete medicine Sample medicine', exact: true }).waitFor({ state: 'hidden' });
        assert.deepEqual(await qa('return qa.deleteRequests'), [
            '/inventory/medicines/medicine-with-two-batches', '/inventory/medicines/medicine-with-two-batches',
        ]);
        assert.equal(await page.getByRole('button', { name: 'Delete medicine Out of stock medicine', exact: true }).count(), 1);
        assert.equal(await page.evaluate(async () => {
            const { queryClient } = await import('/src/lib/queryClient.ts');
            return queryClient.getQueryState(['billing-product-search', 'qa-owner', 'qa-clinic', 'sample']).isInvalidated;
        }), true);

        // Non-owners cannot see deletion; owners can also delete a stockout row.
        await page.evaluate(async () => (await import('/src/lib/auth.ts')).useAuth.setState({ isOwner: false, role: 'CASHIER' }));
        await page.getByRole('button', { name: 'Delete medicine Out of stock medicine', exact: true }).waitFor({ state: 'hidden' });
        await page.evaluate(async () => (await import('/src/lib/auth.ts')).useAuth.setState({ isOwner: true, role: 'OWNER' }));
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'Delete medicine Out of stock medicine', exact: true }).click();
        await finalStep();
        await dialog.getByLabel('Medicine name to confirm').fill('Out of stock medicine');
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
        if (process.env.QA_SCREENSHOT) await page.screenshot({ path: process.env.QA_SCREENSHOT });
        await qa('qa.pending = false');
        await confirm().click();
        await dialog.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Delete medicine Out of stock medicine', exact: true }).waitFor({ state: 'hidden' });
        assert.deepEqual(errors, []);
        console.log('Passed: three-step gating, cancellation/reset, failure/retry, pending guards, all-batch removal, stockouts, permissions, billing cache and mobile layout.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
