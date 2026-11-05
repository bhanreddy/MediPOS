# Supplier invoice import (without AI)

Open **Purchases**, choose a supplier, then select **Import invoice** on an empty purchase draft. The web app reads the file locally; it does not call the existing AI bill-scanning endpoint.

## Supported files

- UTF-8 CSV (including common comma, semicolon and tab delimiters).
- Excel `.xlsx`; select the worksheet number. Save old `.xls` files as `.xlsx` first. Store medicine names and batch identifiers as text to preserve leading zeros. When percentage columns are mapped, choose whether numeric values are whole percentages (`12`) or fractions (`0.12`). Values ending in `%` are interpreted as written. For dates that Excel displays as month/year, verify the extracted date and correct it to month-end if appropriate.
- Text-based PDFs with a recognizable, consistent table. Single-line column headings such as Medicine/Product/Description, Batch, Expiry, Qty, Rate and MRP must repeat on every page. Scans, photos, pages without text, missing headings and changes in table geometry are rejected. This is a positional parser, not a universal PDF invoice reader; new supplier layouts must be checked against real sample invoices.

Use one invoice per file. Limits: 10 MB, 2,000 table rows, 80 columns, and 30 PDF pages. Files containing multiple invoices must be split first; only one worksheet is imported from an Excel file.

## Review and receive

1. Read the invoice and select its table-heading row.
2. Map medicine, batch, expiry, paid quantity, purchase rate and MRP. Optionally map free quantity, GST and discount. Download the CSV template for the supported column names. Supplier mappings can be remembered on the current device, scoped to shop, supplier and format; changed headers require remapping.
3. Preview the lines. A unique exact medicine-name match is suggested; ambiguous or unknown names require an explicit inventory search and selection. Create new medicines in Inventory before importing. Review the medicine's strength, form, pack and stock unit.
4. Correct dates and values; exclude total/footer rows explicitly. Text month-only expiry (`MM/YYYY` or `MM/YY`) becomes the last day of that month. Full slash dates use `DD/MM/YYYY`; ISO dates use `YYYY-MM-DD`. Expired stock, invalid quantities, unsupported GST and invalid prices block inclusion.
5. Quantities and prices must use the existing medicine's inventory stock unit. The importer does not infer strip/box/tablet conversions. Paid quantity is billed; free quantity adds stock without increasing the billed amount. Imported lines use their explicit discount/free quantities and do not infer additional supplier schemes.
6. Confirm the line review, load the purchase draft, and enter the supplier invoice number and invoice date. Select **Confirm receipt & update stock** only when the goods have arrived.

The invoice date defaults to the current purchase date; replace it with the date on the supplier invoice. Import does not extract invoice-header metadata. New batches are created; matching batches at the receiving store are incremented. Existing batch expiry conflicts or disposed batches block receipt. The normal purchase endpoint records purchase lines, supplier payable balance and stock ledger movements.

## Duplicate prevention and audit

Migration `028_invoice_import_receipts.sql` is required. It is picked up by the backend's startup migration runner. Deploy/restart the backend with migrations before serving the updated web client.

Receipt metadata, purchase lines, stock and stock-ledger writes share the purchase transaction. A shop-level transaction lock serializes concurrent purchase receipts. An exact retry with the same request ID returns the original purchase; a changed retry is rejected. The same file hash cannot update stock twice in a shop. Supplier invoice numbers are trimmed, normalized for whitespace and compared without case; duplicate supplier invoices are blocked, including invoices already entered manually.

The receipt retains source filename, format, SHA-256, request ID and the purchase reference. The original file is processed in the browser and is **not archived** on the server by this feature. Invoice posting follows the existing owner permission requirement.

## Validation

- `cd web && npm test`
- `cd web && npm run build`
- `cd backend && npm run typecheck`
- On a disposable local database ending in `_qa`, initialize with `TEST_DATABASE_URL=... node backend/scripts/setup-qa.cjs` after building the backend, then run `TEST_DATABASE_URL=... npm test -- --runInBand src/__tests__/integration/invoiceImport.pg.test.ts` from `backend`.
- With Vite on `http://127.0.0.1:8087` and Playwright available, run `VITE_URL=http://127.0.0.1:8087 node web/tests/browser/invoice-import.cjs`. `PLAYWRIGHT_MODULE` can point to another Playwright installation; `INVOICE_FIXTURES` and `INVOICE_QA_OUTPUT` can override the fixture and screenshot directories. The fixture intercepts all application API calls; database tests separately exercise the real purchase transaction.

Synthetic fixtures exercise CSV, XLSX, text PDF, scan rejection, values, preview confirmation and responsive layout. Real supplier invoices have not yet been used to validate the PDF layouts.
