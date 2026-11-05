import Papa from 'papaparse';
import { pdfInvoiceTable, type InvoiceTable, type PdfTextItem } from './invoiceImportCore';

export async function readInvoiceFile(file: File, sheet = 1): Promise<InvoiceTable> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an invoice smaller than 10 MB.');
  const format = file.name.toLowerCase().split('.').at(-1);
  if (format !== 'csv' && format !== 'xlsx' && format !== 'pdf') throw new Error('Choose CSV, Excel (.xlsx), or a text PDF. Save older .xls files as .xlsx first.');
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  let rows: string[][];
  if (format === 'csv') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
    const errors = parsed.errors.filter(error => error.code !== 'UndetectableDelimiter');
    if (errors.length) throw new Error(`CSV: ${errors[0].message}`);
    rows = parsed.data;
  } else if (format === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    const data = await readSheet(file, sheet);
    rows = data.map(row => row.map(cell => cell instanceof Date
      ? `${cell.getUTCFullYear()}-${String(cell.getUTCMonth() + 1).padStart(2, '0')}-${String(cell.getUTCDate()).padStart(2, '0')}`
      : String(cell ?? '')));
  } else {
    const pdfjs = await import('pdfjs-dist');
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: buffer.slice(0) });
    try {
      const document = await task.promise;
      if (document.numPages > 30) throw new Error('Maximum 30 pages per invoice.');
      const pages: PdfTextItem[][] = [];
      for (let index = 1; index <= document.numPages; index++) {
        const page = await document.getPage(index);
        const text = await page.getTextContent();
        pages.push(text.items.flatMap(item => 'str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : []));
      }
      rows = pdfInvoiceTable(pages);
    } finally { await task.destroy(); }
  }
  if (!rows.length || rows.length > 2001 || rows.some(row => row.length > 80)) throw new Error('Use an invoice with 1–2,000 rows and at most 80 columns.');
  return { filename: file.name, sha256, format, rows };
}
