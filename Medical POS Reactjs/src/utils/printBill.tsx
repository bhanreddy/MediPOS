import { createRoot } from 'react-dom/client';
import { BillPrintLayout, type BillPrintLayoutProps } from '../components/Billing/BillPrintLayout';

/**
 * UTILITY: printBill
 * Thermal / Continuous-roll receipt printer.
 *
 * Paper model: 80 mm wide, auto height (content-driven).
 * The receipt is EXACTLY as tall as its content — the operator tears
 * the paper at the printed edge. No blank A4 tail.
 *
 * Rules:
 *  1. Creates a hidden iframe.
 *  2. Injects thermal-specific CSS (80 mm, auto height, no forced page breaks).
 *  3. Renders BillPrintLayout.
 *  4. Waits for React paint + images.
 *  5. Calls window.print(), then removes the iframe.
 */

// ─── Thermal Print Styles ────────────────────────────────────────────────────
// Width  : 80 mm  (fits 58 mm rolls too — just change the two `80mm` refs)
// Height : auto   — printer feeds exactly as much paper as needed
// Fonts  : kept intentionally small (9–11 px) to match real thermal density
// Color  : everything forced to pure black for monochrome thermal heads
// ─────────────────────────────────────────────────────────────────────────────
const PRINT_STYLES = `

  /* ── Page: 80 mm roll, content-height ───────────────────────────────── */
  @page {
    size: 80mm auto;
    margin: 0;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    width: 80mm;
    /* height: auto — never set a fixed height; let content dictate it */
    background: #fff;
    color: #000;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Root wrapper ────────────────────────────────────────────────────── */
  #print-root {
    width: 80mm;
    padding: 3mm 3mm 6mm 3mm;   /* top | right | bottom(tear-gap) | left */
  }

  /* ── Layout helpers ──────────────────────────────────────────────────── */
  .flex            { display: flex; }
  .flex-col        { flex-direction: column; }
  .items-center    { align-items: center; }
  .items-start     { align-items: flex-start; }
  .items-end       { align-items: flex-end; }
  .justify-center  { justify-content: center; }
  .justify-between { justify-content: space-between; }
  .justify-end     { justify-content: flex-end; }
  .flex-1          { flex: 1 1 0%; }
  .w-full          { width: 100%; }
  .hidden          { display: none; }
  .block           { display: block; }

  /* ── Spacing ─────────────────────────────────────────────────────────── */
  .gap-1      { gap: 2px; }
  .gap-2      { gap: 4px; }
  .mt-1       { margin-top: 2px; }
  .mt-2       { margin-top: 4px; }
  .mt-3       { margin-top: 6px; }
  .mt-4       { margin-top: 8px; }
  .mb-1       { margin-bottom: 2px; }
  .mb-2       { margin-bottom: 4px; }
  .mb-3       { margin-bottom: 6px; }
  .mb-4       { margin-bottom: 8px; }
  .mr-1       { margin-right: 2px; }
  .mr-2       { margin-right: 4px; }
  .ml-auto    { margin-left: auto; }
  .mx-auto    { margin-left: auto; margin-right: auto; }
  .py-1       { padding-top: 2px;  padding-bottom: 2px; }
  .py-2       { padding-top: 4px;  padding-bottom: 4px; }
  .px-1       { padding-left: 2px; padding-right: 2px; }
  .px-2       { padding-left: 4px; padding-right: 4px; }
  .p-2        { padding: 4px; }

  /* ── Typography ──────────────────────────────────────────────────────── */
  .text-center  { text-align: center; }
  .text-left    { text-align: left; }
  .text-right   { text-align: right; }
  
  /* Thermal uses VERY condensed sizes; no rem — px only */
  .text-lg    { font-size: 14px; line-height: 1.3; }
  .text-base  { font-size: 11px; line-height: 1.35; }
  .text-sm    { font-size: 10px; line-height: 1.35; }
  .text-xs    { font-size: 9px;  line-height: 1.3; }
  .text-2xs   { font-size: 8px;  line-height: 1.2; }

  .font-bold    { font-weight: 700; }
  .font-medium  { font-weight: 500; }
  .font-normal  { font-weight: 400; }
  .font-mono    { font-family: 'Courier New', Courier, monospace; }
  
  .uppercase    { text-transform: uppercase; }
  .capitalize   { text-transform: capitalize; }
  .tracking-wide   { letter-spacing: 0.04em; }
  .tracking-wider  { letter-spacing: 0.08em; }
  .leading-tight   { line-height: 1.2; }
  .whitespace-nowrap { white-space: nowrap; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Dividers ────────────────────────────────────────────────────────── */
  .divider-solid  { border: none; border-top: 1px solid #000; margin: 3px 0; }
  .divider-dashed { border: none; border-top: 1px dashed #000; margin: 3px 0; }
  .divider-double {
    border: none;
    border-top: 3px double #000;
    margin: 3px 0;
  }

  /* ── Table ───────────────────────────────────────────────────────────── */
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 9px;
    line-height: 1.3;
  }
  th {
    font-weight: 700;
    text-align: left;
    padding: 1px 2px;
    border-bottom: 1px solid #000;
  }
  td {
    padding: 1px 2px;
    vertical-align: top;
  }
  tr.row-alt { background: transparent; } /* no shading — thermal can't do grey */
  tr.row-total td {
    border-top: 1px solid #000;
    font-weight: 700;
  }

  /* ── Logo ────────────────────────────────────────────────────────────── */
  .shop-logo {
    max-width: 40mm;
    max-height: 12mm;
    object-fit: contain;
    filter: grayscale(100%) contrast(200%);  /* crisp black on thermal head */
    display: block;
    margin: 0 auto 2px auto;
  }

  /* ── Tear-off indicator ──────────────────────────────────────────────── */
  .tear-line {
    width: 100%;
    border: none;
    border-top: 1px dashed #000;
    margin: 4px 0 0 0;
  }
  .tear-label {
    text-align: center;
    font-size: 7px;
    letter-spacing: 0.15em;
    color: #000;
    opacity: 0.6;
    margin-top: 1px;
  }

  /* ── Screen preview (not printed) ───────────────────────────────────── */
  @media screen {
    body {
      display: flex;
      justify-content: center;
      background: #f0f0f0;
      padding: 16px;
    }
    #print-root {
      background: #fff;
      box-shadow: 0 2px 12px rgba(0,0,0,0.18);
    }
  }

  /* ── Suppress screen-only elements during print ─────────────────────── */
  @media print {
    .no-print { display: none !important; }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────

export const printBill = (props: BillPrintLayoutProps) => {
  // 1. Hidden iframe
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    border: 'none',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    console.error('[printBill] Failed to access iframe document');
    document.body.removeChild(iframe);
    return;
  }

  // 2. Write skeleton HTML
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div id="print-root"></div>
</body>
</html>`);
  doc.close();

  // 3. Mount React
  const rootEl = doc.getElementById('print-root');
  if (!rootEl) {
    console.error('[printBill] #print-root not found in iframe');
    document.body.removeChild(iframe);
    return;
  }

  const root = createRoot(rootEl);
  root.render(<BillPrintLayout {...props} />);

  // 4. Wait for paint + images
  const waitForRender = async () => {
    // React first paint
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    // Reflow buffer
    await new Promise<void>(r => setTimeout(r, 80));
    // Wait for any logo/images
    const images = Array.from(doc.images);
    await Promise.all(
      images.map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve(); // don't block on broken images
          })
      )
    );
  };

  waitForRender().then(() => {
    if (iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
    // 5. Cleanup after print dialog closes (~1.5 s is enough for all browsers)
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1500);
  });
};