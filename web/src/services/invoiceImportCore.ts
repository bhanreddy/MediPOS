export const INVOICE_FIELDS = [
  ['medicine_name', 'Medicine', true], ['batch_number', 'Batch', true],
  ['expiry_date', 'Expiry', true], ['quantity', 'Paid quantity', true],
  ['purchase_price', 'Purchase rate', true], ['mrp', 'MRP', true],
  ['free_quantity', 'Free quantity', false], ['gst_rate', 'GST %', false],
  ['discount', 'Discount %', false],
] as const;
export type InvoiceField = typeof INVOICE_FIELDS[number][0];
export type InvoiceMapping = Partial<Record<InvoiceField, number>>;
export type InvoiceValues = Record<InvoiceField, string>;
export type InvoiceSource = { filename: string; sha256: string; format: 'csv' | 'xlsx' | 'pdf' };
export type InvoiceTable = InvoiceSource & { rows: string[][] };

const aliases: Record<InvoiceField, string[]> = {
  medicine_name: ['medicine', 'medicinename', 'name', 'product', 'productname', 'description', 'item', 'itemname', 'particulars'],
  batch_number: ['batch', 'batchno', 'batchnumber', 'bno'],
  expiry_date: ['expiry', 'expirydate', 'exp', 'expdate', 'expdt'],
  quantity: ['qty', 'quantity', 'paidqty', 'billedqty', 'paidquantity'],
  purchase_price: ['rate', 'purchaserate', 'purchaseprice', 'cost', 'costprice', 'ptr'],
  mrp: ['mrp', 'maximumretailprice'],
  free_quantity: ['free', 'freeqty', 'freequantity', 'bonus'],
  gst_rate: ['gst', 'gstpercent', 'gstrate', 'gstpercentage'],
  discount: ['discount', 'discountpercent', 'disc', 'discpercent'],
};
const headerKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export function suggestInvoiceMapping(headers: string[]): InvoiceMapping {
  const mapping: InvoiceMapping = {};
  for (const [field] of INVOICE_FIELDS) {
    const matches = headers.flatMap((header, index) => aliases[field].includes(headerKey(header)) ? [index] : []);
    if (matches.length === 1) mapping[field] = matches[0];
  }
  return mapping;
}
export function findInvoiceHeader(rows: string[][]) {
  return rows.findIndex(row => Object.keys(suggestInvoiceMapping(row)).length >= 4);
}
export function mappingIssues(mapping: InvoiceMapping): string[] {
  const issues: string[] = [];
  const used = new Set<number>();
  for (const [field, label, required] of INVOICE_FIELDS) {
    const column = mapping[field];
    if (column === undefined) { if (required) issues.push(`Map the ${label} column.`); }
    else if (used.has(column)) issues.push('Each source column can only be mapped once.');
    else used.add(column);
  }
  return issues;
}

/** Month-only expiry means the last calendar day of that month. Full slash dates use DD/MM/YYYY. */
export function normalizeInvoiceDate(input: string): string {
  const value = input.trim();
  let date = value;
  const month = /^(\d{1,2})[/-](\d{4}|\d{2})$/.exec(value);
  const full = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (month) {
    const year = month[2].length === 2 ? `20${month[2]}` : month[2];
    const m = Number(month[1]);
    if (m < 1 || m > 12) return value;
    date = `${year}-${String(m).padStart(2, '0')}-${new Date(Date.UTC(Number(year), m, 0)).getUTCDate()}`;
  } else if (full) date = `${full[3]}-${full[2].padStart(2, '0')}-${full[1].padStart(2, '0')}`;
  return date;
}
export function invoiceNumber(value: string, percent = false): number {
  let text = value.trim().replace(/^(?:₹|Rs\.?|INR)\s*/i, '');
  if (percent) text = text.replace(/%$/, '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{2,3})+)(?:\.\d+)?$/.test(text)) return NaN;
  return Number(text.replace(/,/g, ''));
}
export function invoiceLineTotal(quantity: number, rate: number, discount: number, gst: number): number {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const gross = round(quantity * rate);
  const taxable = round(gross - round(gross * discount / 100));
  return round(taxable + round(taxable * gst / 100));
}
export function validateInvoiceValues(values: InvoiceValues, today: string): string[] {
  const issues: string[] = [];
  if (!values.medicine_name.trim()) issues.push('Medicine name is required.');
  if (!values.batch_number.trim()) issues.push('Batch is required.');
  const expiry = normalizeInvoiceDate(values.expiry_date);
  const date = new Date(`${expiry}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry.startsWith('0000') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== expiry)
    issues.push('Enter a valid expiry (YYYY-MM-DD, DD/MM/YYYY or MM/YYYY).');
  else if (expiry < today) issues.push('Expired stock cannot be received.');
  const qty = invoiceNumber(values.quantity), free = invoiceNumber(values.free_quantity || '0');
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 2147483647) issues.push('Paid quantity must be a positive whole number.');
  if (!Number.isSafeInteger(free) || free < 0 || qty + free > 2147483647) issues.push('Free quantity must be a non-negative whole number within the stock limit.');
  const rate = invoiceNumber(values.purchase_price), mrp = invoiceNumber(values.mrp);
  if (!Number.isFinite(rate) || rate <= 0) issues.push('Purchase rate must be positive.');
  if (!Number.isFinite(mrp) || mrp <= 0 || mrp < rate) issues.push('MRP must be at least the purchase rate.');
  if (values.gst_rate && ![0, 5, 12, 18, 28].includes(invoiceNumber(values.gst_rate, true))) issues.push('GST must be 0, 5, 12, 18 or 28%.');
  const discount = invoiceNumber(values.discount || '0', true);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) issues.push('Discount must be between 0 and 100%.');
  return issues;
}
export function mapInvoiceRows(rows: string[][], header: number, mapping: InvoiceMapping, percentageMode: 'whole' | 'fraction' = 'whole') {
  const headers = rows[header] || [];
  return rows.slice(header + 1).flatMap((cells, index) => {
    if (cells.every(cell => !cell.trim())) return [];
    // Repeated table headings are common on subsequent PDF pages.
    if (headers.every((cell, column) => headerKey(cell) === headerKey(cells[column] || ''))) return [];
    const values = Object.fromEntries(INVOICE_FIELDS.map(([field]) => [field,
      mapping[field] === undefined ? '' : (cells[mapping[field]!] || '').trim(),
    ])) as InvoiceValues;
    values.expiry_date = normalizeInvoiceDate(values.expiry_date);
    if (percentageMode === 'fraction') for (const field of ['gst_rate', 'discount'] as const) {
      if (values[field] && !values[field].endsWith('%')) {
        const number = invoiceNumber(values[field]);
        if (Number.isFinite(number)) values[field] = String(Math.round(number * 1000000) / 10000);
      }
    }
    return [{ sourceRow: header + index + 2, values }];
  });
}

export type PdfTextItem = { str: string; x: number; y: number; width: number };
/** Preserve table positions; never guess line-item values from prose or image pixels. */
export function pdfInvoiceTable(pages: PdfTextItem[][]): string[][] {
  const lines = pages.map(items => {
    const grouped: PdfTextItem[][] = [];
    for (const item of [...items].filter(item => item.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = grouped.find(line => Math.abs(line[0].y - item.y) < 3);
      if (line) line.push(item); else grouped.push([item]);
    }
    return grouped.map(line => line.sort((a, b) => a.x - b.x));
  });
  if (lines.some(page => !page.length)) throw new Error('This PDF has a page with no selectable text. Upload a CSV/Excel invoice; scanned PDFs and photos are not supported.');
  const cells = (line: PdfTextItem[]) => {
    const result: PdfTextItem[] = [];
    for (const item of line) {
      const previous = result.at(-1);
      if (previous && item.x - previous.x - previous.width <= 9) {
        previous.str += ` ${item.str}`;
        previous.width = item.x + item.width - previous.x;
      } else result.push({ ...item });
    }
    return result;
  };
  const heading = lines.flat().map(cells).find(line => Object.keys(suggestInvoiceMapping(line.map(cell => cell.str))).length >= 4);
  if (!heading) throw new Error('No supported table heading was found. Use a PDF with single-line column headings such as Medicine, Batch, Expiry, Qty, Rate and MRP, or upload CSV/Excel.');
  const output: string[][] = [heading.map(cell => cell.str)];
  for (const page of lines) {
    let inTable = false;
    let foundHeading = false;
    for (const line of page) {
      const merged = cells(line);
      if (Object.keys(suggestInvoiceMapping(merged.map(cell => cell.str))).length >= 4) {
        // Fail closed when a later page changes the table geometry.
        if (merged.length !== heading.length || merged.some((cell, i) => headerKey(cell.str) !== headerKey(heading[i].str) || Math.abs(cell.x - heading[i].x) > 5))
          throw new Error('The PDF table layout changes between pages. Export this invoice as CSV/Excel.');
        inTable = true; foundHeading = true; continue;
      }
      if (!inTable) continue;
      const row = Array<string>(heading.length).fill('');
      for (const item of line) {
        let column = 0;
        for (let i = 1; i < heading.length; i++) if (item.x >= heading[i].x - 4) column = i;
        row[column] = `${row[column]} ${item.str}`.trim();
      }
      // Keep totals/footers visible for explicit exclusion during review.
      output.push(row);
    }
    if (page.length && !foundHeading) throw new Error('Every PDF page must repeat the table heading. Export this invoice as CSV/Excel to avoid missing lines.');
  }
  return output;
}
