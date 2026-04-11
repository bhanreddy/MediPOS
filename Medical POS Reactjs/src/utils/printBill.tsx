import { createRoot } from 'react-dom/client';
import { BillPrintLayout, type BillPrintLayoutProps } from '../components/Billing/BillPrintLayout';

/**
 * UTILITY: printBill
 * Handles robust iframe-based printing for the POS.
 * 
 * Rules:
 * 1. Creates a hidden iframe.
 * 2. Injects critical CSS (Tailwind subset + Print rules).
 * 3. Renders the BillPrintLayout component.
 * 4. Waits for render/images.
 * 5. Prints and cleans up.
 */

// 1. Definition of critical styles mimicking the Tailwind classes used in BillPrintLayout
const PRINT_STYLES = `
  @page { margin: 0; size: A4 portrait; }
  html { height: 100%; }
  body {
    margin: 0;
    padding: 0;
    min-height: 100%;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: white;
    color: black;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    box-sizing: border-box;
  }

  /* Layout */
  .hidden { display: none; }
  .block { display: block; }
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .items-center { align-items: center; }
  .items-start { align-items: flex-start; }
  .items-end { align-items: flex-end; }
  .justify-center { justify-content: center; }
  .justify-between { justify-content: space - between; }
  .justify-end { justify-content: flex - end; }
  
  .space-y-0\\.5 > * + * { margin-top: 0.125rem; }
  .space-y-1 > * + * { margin-top: 0.25rem; }
  .space-y-2 > * + * { margin-top: 0.5rem; }
  .space-y-3 > * + * { margin-top: 0.75rem; }
  
  .mx-auto { margin-left: auto; margin-right: auto; }
  .w-full { width: 100%; }
  .h-12 { height: 3rem; }
  .max-h-\\[60px\\] { max-height: 60px; }
  .object-contain { object-fit: contain; }
  .w-5 { width: 1.25rem; }
  .flex-1 { flex: 1 1 0%; }

  /* Text */
  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .text-right { text-align: right; }
  
  .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
  .text-2xl { font-size: 1.5rem; line-height: 2rem; }
  .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
  .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
  .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
  .text-xs { font-size: 0.75rem; line-height: 1rem; }
  .text-\\[10px\\] { font - size: 10px; line - height: 14px; }
  .text-\\[8px\\] { font - size: 8px; line - height: 10px; }
  
  .font-black { font-weight: 900; }
  .font-bold { font-weight: 700; }
  .font-medium { font-weight: 500; }
  .font-light { font-weight: 300; }
  .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  
  .italic { font-style: italic; }
  .uppercase { text-transform: uppercase; }
  .capitalize { text-transform: capitalize; }
  .tracking-wide { letter-spacing: 0.025em; }
  .tracking-widest { letter-spacing: 0.1em; } 
  .leading-tight { line-height: 1.25; }
  .leading-none { line-height: 1; }
  .whitespace-pre-wrap { white-space: pre-wrap; }
  
  /* Opacity for gray replacement */
  .opacity-70 { opacity: 0.7; }
  
  /* Legacy Grays (avoid using) */
  .text-gray-500 { color: #6b7280; }
  .text-gray-400 { color: #9ca3af; }

  /* Borders & Spacing */
  .border-b { border-bottom: 1px solid black; }
  .border-t { border-top: 1px solid black; }
  .border-y { border-top: 1px solid black; border - bottom: 1px solid black; }
  .border-dashed { border-style: dashed; }
  .border-black { border-color: black; }
  .opacity-10 { opacity: 0.1; }
  
  .p-4 { padding: 1rem; }
  .px-4 { padding-left: 1rem; padding-right: 1rem; }
  .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
  .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
  .px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
  
  .pb-2 { padding-bottom: 0.5rem; }
  .pb-1 { padding-bottom: 0.25rem; }
  .pb-4 { padding-bottom: 1rem; }
  .pt-2 { padding-top: 0.5rem; }
  .pt-1 { padding-top: 0.25rem; }
  .pt-4 { padding-top: 1rem; }
  
  .mb-1 { margin-bottom: 0.25rem; }
  .mb-2 { margin-bottom: 0.5rem; }
  .mb-4 { margin-bottom: 1rem; }
  .mb-6 { margin-bottom: 1.5rem; }
  .mt-0\\.5 { margin-top: 0.125rem; }
  .mt-1 { margin-top: 0.25rem; }
  .mt-2 { margin-top: 0.5rem; }
  .mt-4 { margin-top: 1rem; }
  .mr-2 { margin-right: 0.5rem; }
  
  .gap-1 { gap: 0.25rem; }
  .gap-2 { gap: 0.5rem; }

  /* Misc */
  .grayscale { filter: grayscale(100%); }
  .align-top { vertical-align: top; }
  .align-bottom { vertical-align: bottom; }
  
  table { border-collapse: collapse; width: 100%; }

  #print-root {
    flex: 0 0 auto;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 8mm 10mm 0 10mm;
    box-sizing: border-box;
  }

  /* Few line items: keep the receipt in the upper ~half of A4 (top-aligned, not vertically centered). */
  @media print {
    .bill-print-root--half {
      margin-top: 0;
      margin-bottom: auto;
      max-height: 135mm;
      page-break-inside: avoid;
    }
    .bill-print-root--full {
      max-height: none;
      margin-bottom: 0;
      min-height: 0;
    }
  }

  @media screen {
    body { padding: 10mm; min-height: auto; display: block; }
    #print-root { display: block; padding: 0; }
  }
`;

export const printBill = (props: BillPrintLayoutProps) => {
    // 1. Create hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
        console.error("Print: Failed to access iframe document");
        document.body.removeChild(iframe);
        return;
    }

    // 2. Inject Skeleton & Styles
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>${PRINT_STYLES}</style>
        </head>
        <body>
            <div id="print-root"></div>
        </body>
        </html>
    `);
    doc.close();

    // 3. Mount React Component
    const rootEl = doc.getElementById('print-root');
    if (rootEl) {
        const root = createRoot(rootEl);
        root.render(<BillPrintLayout {...props} />);

        // 4. Wait for Render & Images
        const waitForImages = async () => {
            // Initial tick to allow React mounting
            await new Promise(r => requestAnimationFrame(r));
            // Small buffer for reflow
            await new Promise(r => setTimeout(r, 50));

            // Check all images in the iframe
            const images = Array.from(doc.images);
            await Promise.all(images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve; // Continue even if image fails
                });
            }));
        };

        waitForImages().then(() => {
            if (iframe.contentWindow) {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            }
            // 5. Cleanup
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }, 1000);
        });
    }
};
