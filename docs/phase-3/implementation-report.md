# Medical POS Phase 3

## A. Phase summary

The main counter now supports live dispensing by a registered pharmacist. A signed prescription, exact patient and product match, written dose and quantity, store readiness, physical register evidence, and stock and financial settlement are required. PostgreSQL commits the prescription evidence with the invoice and stock changes. Tax invoices and credit notes snapshot the issuer, recipient, products, batches and tax amounts. The Reports Hub exposes the new registers, operational reports and GSTR-1 preparation JSON.

## B. Files changed

- Migrations `backend/migrations/043_regulated_dispensing_register.sql` and `044_invoice_tax_snapshots.sql`.
- Backend API and validation in `backend/src/routes/counter.ts`, `dispensing.ts`, `index.ts`, `prescriptions.ts`, `reports.ts`, `sales.ts`, `backend/src/schemas/customer.schema.ts`, and `sale.schema.ts`.
- Services in `backend/src/services/cloudSaleAllocation.ts`, `cloudSaleReturns.ts`, `gstInvoiceExport.ts`, `invoiceSnapshot.ts`, `offlineCommands.ts`, `pharmacyReports.ts`, `regulatedDispensing.ts`, and `prescription/prescriptionService.ts`.
- Web UI in `web/src/components/Billing/BillPrintLayout.tsx`, `web/src/components/Prescriptions/CounterPrescriptionFields.tsx`, `DispensingSetupDialog.tsx`, `PrescriptionQueuePage.tsx`, and `web/src/components/clinic/CustomersListPage.tsx`, `PharmacyReportsPanel.tsx`, `ReportsHubPage.tsx`, and `WebPos.tsx`.
- Web models and services in `web/src/core/types.ts`, `web/src/services/billingService.ts`, `customerService.ts`, and `printerService.ts`.
- Tests and fixtures in `backend/src/__tests__/integration/phase3Pharmacy.pg.test.ts`, `billingPerformance.pg.test.ts`, `backend/scripts/serve-phase1-qa.cjs`, and `test-phase3-browser.cjs`. Phase 3 plan and report in `docs/phase-3/`. No files removed.

## C. Database changes

043 adds a store dispensing setting, verified pharmacist registrations and append-only dispensing records linked to signed documents, invoices, prescriptions, patients, products and batches. It replaces the blanket restricted-sale trigger with a deferred evidence check. Cashier, offline, legacy checkout and NDPS paths stay fail-closed. 044 adds invoice and line snapshots and financial-year sequences for new sales and credit notes. It leaves historical snapshots null. Retain clinical and invoice evidence if rolling back the app. Reinstall the Phase 1 deny-all dispensing trigger before running any older application version that lacks the new authorization checks.

## D. APIs changed

- `/api/dispensing/setup`, `/api/dispensing/pharmacists/:id`, and `/api/dispensing/prescriptions` expose scoped owner setup and the pharmacist's verified patient prescriptions.
- `POST /api/prescriptions` accepts the prescriber's written address, prescription date, and medicine dose. `POST /api/sales` validates the clinical attachment and physical register evidence and snapshots supply details. Customer writes accept a GSTIN and billing or patient address. Invoice and return reads preserve the original snapshots.
- `GET /api/reports/prescription-register`, `/schedule-h1`, `/schedule-x`, and `/register/:kind` return role-restricted JSON or CSV. `GET /api/reports/operations` exposes ten management reports. `GET /api/reports/gstr1-export` prepares an owner-only JSON export and returns review warnings separately.

## E. Verified features

- PostgreSQL fixtures dispensed H, H1 and X only after a registered pharmacist verified and linked a signed prescription. They rejected unsigned or unverified evidence, cashier checkout, an excess quantity, offline replay and reuse. The Schedule X case rejected a missing retained duplicate reference and captured its actual inward invoice, supplier licence and physical register reference.
- Chrome verified a pharmacist selecting the patient and prescription, supplying H1, retrieving the rendered tax invoice, and previewing and downloading the separate H1 register.
- Real PostgreSQL verified a 5% inclusive sale with CGST/SGST for an intra-State supply and IGST for an inter-State supply. The return retained the original tax split after catalogue edits. The JSON export used those snapshots for registered invoices, credit notes, unregistered summaries and separate HSN sections. All ten management report endpoints were exercised.

## F. Testing results

- `npm --prefix backend test -- --runInBand` passed 918 tests in the final run. Four external Supabase tests were skipped.

- `npm --prefix backend run build` passed. `node backend/scripts/setup-qa.cjs` applied all migrations to disposable local PostgreSQL 17.
- `npm --prefix backend test -- --runInBand phase3Pharmacy.pg.test.ts` passed four real PostgreSQL tests.
- `npm --prefix web test` passed 127 tests, and `npm --prefix web run build` passed.
- `node --test mobile/tests/*.test.cjs` passed 41 tests. A physical mobile workflow was not tested.
- `node backend/scripts/test-phase3-browser.cjs` passed against the local QA fixture in Chrome.
- `git diff --check` passed.

## G. Remaining limits

The application cannot independently inspect a pharmacist's registration, a physical register, a Form 20F licence, secure storage, or a signed original. Enabling regulated checkout requires store and pharmacist setup. Schedule X still requires the physical bound register, secured stock and duplicate-prescription retention. The electronic export captures dispensing and its referenced inward evidence. Repeat dispensing, NDPS dispensing, compounding, veterinary exceptions, regulatory e-signatures, e-invoicing and GST filing are outside the implemented workflow. Dispensed regulated medicines cannot be restocked through a return.

GSTR-1 JSON was checked against local transaction fixtures. Portal import and filing remain unverified. The export flags incomplete historical invoices, and nil, exempt and non-GST classifications require review when older product records do not distinguish them. The system uses the catalogue GST rate stored for each product and does not classify the entire catalogue from Gazette notices.

## H. Phase 3 exit criteria

1. **PASSED (local app workflow)** — H, H1 and X cases worked with their different preconditions. A licensed-site operational check remains **NOT VERIFIED**.
2. **PASSED** — The authenticated role, current store registration, prescription and patient were checked server-side.
3. **PASSED (electronic records)** — Distinct register exports contain the tested supply evidence. Physical books and signatures remain the operator's responsibility.
4. **PASSED** — The tested reports read actual PostgreSQL records.
5. **PASSED** — Intra-State, inter-State and credit-note values matched the printed snapshots.
6. **PASSED (local exports)** — Register CSV downloads and GSTR-1 JSON reconciliation passed locally. Portal import remains **NOT VERIFIED**.
7. **PASSED** — The implemented conditions are tied to the rules below. This is an engineering verification record.

## I. Risk assessment

Compare electronic and signed physical registers before enabling restricted checkout at a pharmacy. Confirm stock and classifications for the relevant licence and review historic and zero-rate transactions before relying on the filing export.

Rule 65 requires registered pharmacist supervision, dated written prescriptions, general records for H/H1, and a distinct H1 register retained for three years. X requires the duplicate prescription, distinct physical register and secured storage. The implementation uses one verified prescription per checkout and avoids extending repeat or substitution rules. [CDSCO consolidated Drugs Rules, Rule 65](https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2022/drug_rules/Drugs%20Rules%201945_2024%2009.pdf) · [CDSCO Gazette notifications and drafts](https://www.cdsco.gov.in/opencms/opencms/en/Notifications/Gazette-Notifications/)

Invoice fields and the 16-character number limit follow the CBIC rule. The export groups HSN by registered and unregistered recipients, and separates large inter-State unregistered supplies for the periods defined in the utility. [CBIC CGST Rule 46](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001) · [GST Portal returns utility](https://tutorial.gst.gov.in/downloads/invoiceuploadofflineutility.pdf) · [GST Portal HSN and document-series advisory](https://tutorial.gst.gov.in/downloads/news/updated_advisory_hsn_table12_25042025.pdf)

## J. Next phase readiness

The local application and database workflows are ready for Phase 4. Production configuration, physical records and external portal checks are release gates.
