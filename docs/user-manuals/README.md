# MedPOS simple user manuals

Three matching five-page manuals for shop owners and billing staff:

- [Telugu PDF](../../output/pdf/medpos-user-manual-telugu.pdf)
- [English PDF](../../output/pdf/medpos-user-manual-english.pdf)
- [Telugu and English hybrid PDF](../../output/pdf/medpos-user-manual-hybrid.pdf)

Each covers sign-in, navigation, billing and payments, invoice reprinting, inventory, supplier purchases, customers, expenses, reports, mobile navigation, daily work and common problems. The Telugu edition retains English interface labels so readers can find the controls. The hybrid edition combines Telugu instructions with everyday English software terms.

The matching Markdown files are editable text copies. The HTML copies can be opened in a browser and printed on A4 paper. `build_manuals.py` contains all three editions and generates both formats. `render_manuals.cjs` prints the HTML to PDF using this workspace's bundled Playwright and installed Chrome; update its runtime paths if rebuilding on another computer.

Prepared on 28 October 2026 from the current web and mobile source. The step-by-step workflows follow the web app, with separate mobile navigation notes. Features outside basic daily shop work are beyond this guide's scope. Account permissions and deployed versions can affect availability.

Source checkpoints: `ClinicLayout.tsx`, `WebPos.tsx`, `BillingSalesListPage.tsx`, `InventoryScreen.tsx`, `AddBatchModal.tsx`, `PurchaseScreen.tsx`, `PurchaseItemModal.tsx`, `PurchasesListPage.tsx`, `SuppliersListPage.tsx`, `CustomersListPage.tsx`, `ExpensesListPage.tsx`, `ReportsHubPage.tsx`, `LoginScreen.tsx`, `ClinicProfileSettings.tsx`, `appContent.ts`, and the mobile `TabBar.tsx` and dashboard screen.

Validation: all three PDFs have five pages and selectable text. All 15 rendered pages were visually reviewed for layout and missing characters, including Telugu shaping. This is document validation, not a live transaction test.
