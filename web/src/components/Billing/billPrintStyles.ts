/** Shared by the print document and its previews; no Tailwind runtime required. */
export const BILL_PRINT_STYLES = `
  @page { size: auto; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: var(--receipt-paper-width, 80mm); }
  .bill-print-root {
    width: 100%; margin: 0; padding: 4mm;
    color: #000; background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11.5px; line-height: 1.4;
    font-variant-numeric: tabular-nums;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .bill-print-root p, .bill-print-root h1, .bill-print-root dl, .bill-print-root dd { margin: 0; }
  .receipt-header { text-align: center; padding-bottom: 3mm; border-bottom: 1.5px solid #000; }
  .receipt-logo { display: block; width: 11mm; height: 11mm; object-fit: contain; margin: 0 auto 2mm; filter: grayscale(1); }
  .receipt-logo[hidden] { display: none; }
  .receipt-shop-name { font-size: 21px; font-weight: 800; line-height: 1.15; text-transform: uppercase; overflow-wrap: anywhere; }
  .receipt-owner { margin-top: 1mm !important; font-size: 10.5px; }
  .receipt-address { margin-top: 1.5mm !important; text-wrap: pretty; overflow-wrap: anywhere; }
  .receipt-phone { margin-top: 1mm !important; font-weight: 600; }
  .receipt-registration { margin-top: 1.5mm; font-size: 10px; overflow-wrap: anywhere; }
  .receipt-invoice { padding: 2.5mm 0; }
  .receipt-kicker { font-size: 10px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; margin-bottom: 1.5mm !important; }
  .receipt-invoice-id { display: flex; align-items: baseline; justify-content: space-between; gap: 3mm; }
  .receipt-invoice-id > span { flex-shrink: 0; }
  .receipt-invoice-id strong { text-align: right; font-size: 12px; overflow-wrap: anywhere; min-width: 0; }
  .receipt-date { display: flex; justify-content: space-between; gap: 2mm; margin-top: 1mm; }
  .receipt-customer { display: flex; flex-wrap: wrap; column-gap: 2mm; margin-top: 1.5mm; padding-top: 1.5mm; border-top: 1px dashed #000; }
  .receipt-customer strong { overflow-wrap: anywhere; }
  .receipt-customer-phone { width: 100%; }
  .receipt-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .receipt-col-item { width: 45%; } .receipt-col-qty { width: 10%; }
  .receipt-col-rate { width: 21%; } .receipt-col-amount { width: 24%; }
  .receipt-items th { font-size: 10.5px; font-weight: 700; text-align: left; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1.5mm 0; }
  .receipt-items th + th, .receipt-item-main td + td { padding-left: 1mm; }
  .receipt-item-main td { padding-top: 2.2mm; vertical-align: top; font-size: 11.5px; }
  .receipt-item-name { font-weight: 700; overflow-wrap: anywhere; padding-right: 1.5mm; }
  .receipt-item-amount { font-weight: 700; }
  .receipt-items .receipt-number { text-align: right; overflow-wrap: anywhere; }
  .receipt-item-meta { display: flex; flex-wrap: wrap; gap: .5mm 2.5mm; font-size: 10px; }
  .receipt-item-meta b { font-weight: 500; }
  .receipt-item-meta > span { max-width: 100%; overflow-wrap: anywhere; }
  .receipt-item-details td { padding: 1mm 0 2.2mm; border-bottom: 1px dashed #000; }
  .receipt-item-details, .receipt-item-main { break-inside: avoid; }
  .receipt-item-main { break-after: avoid; }
  .receipt-item-count { display: flex; justify-content: space-between; gap: 2mm; padding: 1.5mm 0 2mm; font-size: 10px; }
  .receipt-totals { break-inside: avoid; }
  .receipt-summary > div, .receipt-payment > div { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; padding: .55mm 0; }
  .receipt-summary dd, .receipt-payment dd { text-align: right; font-weight: 600; overflow-wrap: anywhere; }
  .receipt-grand-total { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; margin-top: 1.5mm; padding: 2mm 0; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; }
  .receipt-grand-total > span { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; }
  .receipt-grand-total strong { font-size: 24px; font-weight: 800; line-height: 1.15; overflow-wrap: anywhere; min-width: 0; text-align: right; }
  .receipt-payment { margin-top: 1.5mm !important; font-size: 11px; }
  .receipt-balance { font-weight: 700; }
  .receipt-footer { text-align: center; padding-top: 4mm; break-inside: avoid; }
  .receipt-thanks { font-weight: 700; font-size: 12px; }
  .receipt-policy { margin-top: 1.5mm !important; font-size: 10px; }
  .receipt-wish { margin-top: 1.5mm !important; font-size: 11px; }
  .receipt-powered { margin-top: 3mm !important; font-size: 9px; }
  .bill-print-root--58 { padding: 3mm; font-size: 10.5px; }
  .bill-print-root--58 .receipt-shop-name { font-size: 18px; }
  .bill-print-root--58 .receipt-item-main td { font-size: 10px; }
  .bill-print-root--58 .receipt-item-meta, .bill-print-root--58 .receipt-items th { font-size: 9px; }
  .bill-print-root--58 .receipt-grand-total strong { font-size: 21px; }
  .bill-print-root--58 .receipt-invoice-id { display: block; }
  .bill-print-root--58 .receipt-invoice-id strong { display: block; text-align: left; }
  .bill-print-root--58 .receipt-items colgroup { display: none; }
  .bill-print-root--58 .receipt-items thead, .bill-print-root--58 .receipt-items tbody { display: block; width: 100%; }
  .bill-print-root--58 .receipt-items thead tr, .bill-print-root--58 .receipt-item-main { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .bill-print-root--58 .receipt-items thead tr { border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .bill-print-root--58 .receipt-items th { border: 0; padding: 1mm 0; }
  .bill-print-root--58 .receipt-items th:first-child { grid-column: 1 / -1; padding-bottom: 0; }
  .bill-print-root--58 .receipt-item-name { grid-column: 1 / -1; font-size: 11px !important; padding-right: 0; }
  .bill-print-root--58 .receipt-item-main td + td { padding: 1mm 0 0; white-space: nowrap; }
  .bill-print-root--58 .receipt-items th:nth-child(2), .bill-print-root--58 .receipt-item-main td:nth-child(2) { text-align: left; }
  .bill-print-root--58 .receipt-item-details { display: block; }
  .bill-print-root--58 .receipt-item-details td { display: block; width: 100%; }
  @media print { .bill-print-root { margin: 0; } }
`;
