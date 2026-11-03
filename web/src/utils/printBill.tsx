import { renderToStaticMarkup } from 'react-dom/server';
import { BillPrintLayout, type BillPrintLayoutProps } from '../components/Billing/BillPrintLayout';
import { BILL_PRINT_STYLES } from '../components/Billing/billPrintStyles';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

/** The same complete document is used for printing and visual verification. */
export function createBillPrintDocument(props: BillPrintLayoutProps): string {
    const paperWidth = props.paperWidthMm === 58 ? 58 : 80;
    const markup = renderToStaticMarkup(<BillPrintLayout {...props} paperWidthMm={paperWidth} />);
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />' +
        '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
        '<title>Invoice ' + escapeHtml(props.invoiceNumber) + '</title>' +
        '<style>' + BILL_PRINT_STYLES + ':root { --receipt-paper-width: ' + paperWidth + 'mm; }</style>' +
        '</head><body><main id="print-root">' + markup + '</main></body></html>';
}

async function waitForPrintAssets(doc: Document): Promise<void> {
    const images = Array.from(doc.images);
    await Promise.all(images.map(image => new Promise<void>(resolve => {
        const finish = () => {
            window.clearTimeout(timeout);
            image.removeEventListener('load', finish);
            image.removeEventListener('error', finish);
            if (!image.naturalWidth) image.hidden = true;
            resolve();
        };
        const timeout = window.setTimeout(finish, 5_000);
        if (image.complete) finish();
        else {
            image.addEventListener('load', finish, { once: true });
            image.addEventListener('error', finish, { once: true });
        }
    })));
    if (doc.fonts) await Promise.race([
        doc.fonts.ready,
        new Promise<void>(resolve => window.setTimeout(resolve, 1_500)),
    ]);
}

/** Print at the selected roll width, using only the paper height the receipt needs. */
export async function printBill(props: BillPrintLayoutProps): Promise<void> {
    const paperWidth = props.paperWidthMm === 58 ? 58 : 80;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Invoice print');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + paperWidth +
        'mm;height:1px;border:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const cleanup = () => iframe.remove();
    try {
        const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
        const win = iframe.contentWindow;
        if (!doc || !win) throw new Error('Unable to open the invoice print document.');
        doc.open();
        doc.write(createBillPrintDocument(props));
        doc.close();
        await waitForPrintAssets(doc);
        const receipt = doc.querySelector<HTMLElement>('.bill-print-root');
        if (!receipt) throw new Error('Invoice content is unavailable.');
        const heightMm = Math.ceil(receipt.getBoundingClientRect().height * 25.4 / 96) + 1;
        const page = doc.createElement('style');
        page.textContent = '@page { size: ' + paperWidth + 'mm ' + heightMm + 'mm; margin: 0; }';
        doc.head.appendChild(page);
        win.addEventListener('afterprint', cleanup, { once: true });
        // Some browsers do not dispatch afterprint. Allow time for an open print dialog.
        window.setTimeout(cleanup, 300_000);
        win.focus();
        win.print();
    } catch (error) {
        cleanup();
        throw error;
    }
}
