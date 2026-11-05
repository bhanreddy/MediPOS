import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import api from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useProductSearch } from '../../hooks/useProductSearch';
import { mapMedicineSearchResult } from '../../services/productLookupService';
import { readInvoiceFile } from '../../services/invoiceFileReader';
import { INVOICE_FIELDS, findInvoiceHeader, invoiceNumber, mapInvoiceRows, mappingIssues, normalizeInvoiceDate,
  suggestInvoiceMapping, validateInvoiceValues, type InvoiceMapping, type InvoiceSource, type InvoiceTable, type InvoiceValues } from '../../services/invoiceImportCore';
import type { Product } from '../../core/types';
import type { PurchaseItemDraft } from '../../hooks/usePurchaseFlow';

type ReviewRow = { sourceRow: number; values: InvoiceValues; included: boolean; product: Product | null };
type MatchProduct = Product & { pack_size?: string; base_unit?: string; sale_unit?: string };
type Props = { supplierId: string; disabled: boolean; onImport: (source: InvoiceSource, items: Omit<PurchaseItemDraft, 'id' | 'total'>[]) => void };
const localToday = () => new Date().toLocaleDateString('en-CA');

function ReviewItem({ row, onChange }: { row: ReviewRow; onChange: (row: ReviewRow) => void }) {
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const { results, isSearching, error } = useProductSearch(searching ? search : '');
  const issues = validateInvoiceValues(row.values, localToday());
  const product = row.product as MatchProduct | null;
  return <div className={`rounded-xl border p-4 space-y-3 ${row.included ? 'border-border' : 'border-border opacity-60'}`}>
    <label className="flex gap-2 items-center text-sm font-semibold">
      <input type="checkbox" checked={row.included} onChange={event => onChange({ ...row, included: event.target.checked })} />
      Row {row.sourceRow}: {row.values.medicine_name || '(no medicine name)'}
    </label>
    {row.included && <>
      <div className="text-sm space-y-2">
        {product ? <div className="flex flex-wrap items-center justify-between gap-2">
          <div><strong>Inventory medicine: {product.name}</strong><p className="text-muted text-xs">{product.manufacturer} {product.pack_size ? ` · Pack: ${product.pack_size}` : ''}{product.base_unit ? ` · Stock unit: ${product.base_unit}` : ''}</p></div>
          <Button size="sm" variant="ghost" onClick={() => { onChange({ ...row, product: null }); setSearching(true); setSearch(row.values.medicine_name); }}>Change medicine</Button>
        </div> : <>
          <p className="text-danger">Choose the inventory medicine. Check strength, form and pack size. Create unknown medicines in Inventory first.</p>
          <Input label={`Search inventory for row ${row.sourceRow}`} value={search} placeholder={row.values.medicine_name}
            onFocus={() => { if (!search) setSearch(row.values.medicine_name); setSearching(true); }}
            onChange={event => { setSearch(event.target.value); setSearching(true); }} />
          {isSearching && <p role="status">Searching…</p>}
          {error && <p role="alert" className="text-danger">{error}</p>}
          {results.length > 0 && <div className="max-h-40 overflow-auto border border-border rounded-lg">{results.map(({ product: match }) =>
            <button type="button" key={match.id} className="block w-full text-left p-3 hover:bg-surface-elevated" onClick={() => { onChange({ ...row, product: match }); setSearching(false); }}>
              <strong>{match.name}</strong><span className="block text-xs text-muted">{match.composition} · {match.manufacturer}</span>
            </button>)}</div>}
        </>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{INVOICE_FIELDS.filter(([field]) => field !== 'medicine_name').map(([field, label]) =>
        <Input key={field} label={label} aria-label={`${label}, row ${row.sourceRow}`} value={row.values[field]}
          placeholder={field === 'gst_rate' ? `Medicine default: ${product?.gst_rate ?? '—'}` : field === 'expiry_date' ? 'MM/YYYY or YYYY-MM-DD' : ''}
          onChange={event => onChange({ ...row, values: { ...row.values, [field]: event.target.value } })} />)}</div>
      {issues.length > 0 && <p role="alert" className="text-sm text-danger">{issues.join(' ')}</p>}
    </>}
  </div>;
}

export function InvoiceImportPanel({ supplierId, disabled, onImport }: Props) {
  const clinicId = useAuth(state => state.clinic_id);
  const scope = sessionStorage.getItem('impersonate_clinic_id') || clinicId;
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState(1);
  const [table, setTable] = useState<InvoiceTable | null>(null);
  const [header, setHeader] = useState(0);
  const [mapping, setMapping] = useState<InvoiceMapping>({});
  const [percentageMode, setPercentageMode] = useState<'' | 'whole' | 'fraction'>('');
  const [review, setReview] = useState<ReviewRow[] | null>(null);
  const [page, setPage] = useState(0);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const templateKey = table ? `invoice-template:v1:${scope}:${supplierId}:${table.format}` : '';
  const selected = useMemo(() => review?.filter(row => row.included) || [], [review]);
  const issueCount = useMemo(() => selected.filter(row => !row.product || validateInvoiceValues(row.values, localToday()).length).length, [selected]);
  const mappingErrors = mappingIssues(mapping);
  if (table?.format === 'xlsx' && (mapping.gst_rate !== undefined || mapping.discount !== undefined) && !percentageMode)
    mappingErrors.push('Choose how numeric Excel percentages are stored.');

  async function readFile() {
    if (!file) return;
    setBusy(true); setError(''); setNotice(''); setReview(null); setVerified(false); setTable(null); setPercentageMode('');
    try {
      const parsed = await readInvoiceFile(file, sheet);
      const found = Math.max(0, findInvoiceHeader(parsed.rows));
      let nextMapping = suggestInvoiceMapping(parsed.rows[found]);
      try {
        const saved = JSON.parse(localStorage.getItem(`invoice-template:v1:${scope}:${supplierId}:${parsed.format}`) || 'null');
        // A changed layout must be remapped, never silently interpreted by old indexes.
        if (saved && JSON.stringify(saved.headers) === JSON.stringify(parsed.rows[found])) {
          nextMapping = saved.mapping;
          if (saved.percentageMode === 'whole' || saved.percentageMode === 'fraction') setPercentageMode(saved.percentageMode);
          setNotice('Saved supplier column mapping applied.');
        }
      } catch { /* Storage is optional; parsing remains available. */ }
      setTable(parsed); setHeader(found); setMapping(nextMapping);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not read this invoice.'); }
    finally { setBusy(false); }
  }

  async function preparePreview() {
    if (!table || mappingErrors.length) return;
    setBusy(true); setError(''); setVerified(false);
    try {
      const mapped = mapInvoiceRows(table.rows, header, mapping, percentageMode || 'whole');
      if (!mapped.length) throw new Error('No invoice lines were found after the selected heading.');
      const names = [...new Set(mapped.map(row => row.values.medicine_name.trim()).filter(Boolean))];
      const response = names.length ? await api.post('/purchases/invoice-matches', { names }) : { data: { data: [] } };
      const matches = response.data.data as (Record<string, unknown> & { name: string })[];
      setReview(mapped.map(row => {
        const exact = matches.filter(match => match.name.trim().toLowerCase() === row.values.medicine_name.trim().toLowerCase());
        const match = exact.length === 1 ? exact[0] : null;
        const product = match ? { ...mapMedicineSearchResult(match, false, localToday()).product, pack_size: match.pack_size, base_unit: match.base_unit, sale_unit: match.sale_unit } as MatchProduct : null;
        return { ...row, included: true, product };
      }));
      setPage(0);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not match medicines. Try preview again.'); }
    finally { setBusy(false); }
  }

  function useInvoice() {
    if (!table || !verified || !selected.length || issueCount) return;
    onImport(table, selected.map(row => ({
      product: row.product!, batchNumber: row.values.batch_number.trim(), expiryDate: normalizeInvoiceDate(row.values.expiry_date),
      quantity: invoiceNumber(row.values.quantity), freeQuantity: invoiceNumber(row.values.free_quantity || '0'),
      costPrice: invoiceNumber(row.values.purchase_price), mrp: invoiceNumber(row.values.mrp),
      gstRate: row.values.gst_rate ? invoiceNumber(row.values.gst_rate, true) : Number(row.product!.gst_rate || 0),
      discount: invoiceNumber(row.values.discount || '0', true),
    })));
    setOpen(false); setTable(null); setReview(null); setFile(null); setError('');
  }

  return <section className="rounded-xl border border-border bg-surface-elevated p-4 md:p-6 space-y-4 select-text">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="font-semibold">Import supplier invoice</h2><p className="text-sm text-muted">CSV, Excel (.xlsx) or selectable-text PDF. No AI or OCR.</p></div>
      <Button variant="secondary" disabled={disabled || !supplierId || busy} onClick={() => setOpen(value => !value)}>{open ? 'Close importer' : 'Import invoice'}</Button></div>
    {!supplierId && <p className="text-xs text-muted">Select a supplier above to import an invoice.</p>}
    {disabled && <p className="text-xs text-muted">Start with an empty draft to import a complete invoice.</p>}
    {open && !disabled && <>
      <p className="text-sm text-muted">Use one invoice per file. Excel reads the chosen worksheet. PDFs need consistent, single-line table headings repeated on every page. Scans and photos are unsupported.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm space-y-2 min-w-0"><span className="block">Invoice file (up to 10 MB)</span><input aria-label="Invoice file" className="block max-w-full" type="file" accept=".csv,.xlsx,.pdf" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); setTable(null); setReview(null); setError(''); }} /></label>
        {file?.name.toLowerCase().endsWith('.xlsx') && <Input label="Worksheet number" type="number" min={1} value={sheet} disabled={busy} onChange={event => { setSheet(Math.max(1, Number(event.target.value))); setTable(null); setReview(null); }} />}
        <Button disabled={!file || busy} onClick={() => void readFile()}>{busy ? 'Reading…' : 'Read invoice'}</Button>
        <Button variant="ghost" onClick={() => {
          const csv = '\uFEFF' + INVOICE_FIELDS.map(([field]) => field).join(',') + '\r\n';
          const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
          const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'supplier-invoice-template.csv'; anchor.click(); URL.revokeObjectURL(url);
        }}>Download CSV template</Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger whitespace-pre-wrap">{error}</p>}
      {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
      {table && !review && <div className="space-y-4">
        <Select label="Table heading row" value={header} disabled={busy} options={table.rows.map((row, i) => ({ value: String(i), label: `Row ${i + 1}: ${row.join(' | ').slice(0, 100)}` }))}
          onChange={event => { const next = Number(event.target.value); setHeader(next); setMapping(suggestInvoiceMapping(table.rows[next])); }} />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{INVOICE_FIELDS.map(([field, label, required]) =>
          <Select key={field} label={`${label}${required ? ' *' : ''}`} value={mapping[field] ?? ''} disabled={busy}
            options={[{ value: '', label: 'Not mapped' }, ...table.rows[header].map((name, i) => ({ value: String(i), label: `${i + 1}. ${name || '(blank)'}` }))]}
            onChange={event => setMapping(current => ({ ...current, [field]: event.target.value === '' ? undefined : Number(event.target.value) }))} />)}</div>
        <div className="overflow-x-auto rounded-lg border border-border"><table className="text-xs w-full"><caption className="text-left p-3 text-muted">Source preview — first five rows after the heading</caption><thead><tr>{table.rows[header].map((name, i) => <th className="p-2 text-left" key={i}>{name || `Column ${i + 1}`}</th>)}</tr></thead><tbody>{table.rows.slice(header + 1, header + 6).map((row, i) => <tr className="border-t border-border" key={i}>{row.map((cell, j) => <td className="p-2" key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
        {table.format === 'xlsx' && <div className="space-y-2"><Select label="Numeric Excel percentages" value={percentageMode} disabled={busy}
          options={[{ value: '', label: 'Choose using the source preview above' }, { value: 'whole', label: 'Whole percentages: 12 means 12%' }, { value: 'fraction', label: 'Fractions: 0.12 means 12%' }]}
          onChange={event => setPercentageMode(event.target.value as 'whole' | 'fraction')} />
          <p className="text-xs text-muted">Excel stores percentage-formatted cells as fractions. Text ending in % is read as written. Verify expiry dates when Excel displays only a month and year; edit to the correct month-end date in the preview.</p></div>}
        {mappingErrors.length > 0 && <p className="text-sm text-danger">{mappingErrors.join(' ')}</p>}
        <div className="flex flex-wrap gap-3"><Button disabled={busy || !!mappingErrors.length} onClick={() => void preparePreview()}>Preview & match medicines</Button>
          <Button variant="secondary" disabled={busy || !!mappingErrors.length} onClick={() => {
            try { localStorage.setItem(templateKey, JSON.stringify({ headers: table.rows[header], mapping, percentageMode })); setNotice('Supplier column mapping saved on this device.'); }
            catch { setError('The browser could not save this mapping. You can still import the invoice.'); }
          }}>Remember supplier mapping</Button></div>
      </div>}
      {review && <div className="space-y-4">
        <div className="flex flex-wrap justify-between gap-2"><strong>{selected.length} included lines · {issueCount} need attention</strong><Button variant="ghost" onClick={() => { setReview(null); setVerified(false); }}>Back to column mapping</Button></div>
        <p className="text-sm text-muted">Review every line and exclude totals or footers using its checkbox. Expiry accepts MM/YYYY, DD/MM/YYYY or YYYY-MM-DD. Rates are per inventory stock unit, before GST.</p>
        {review.slice(page * 20, page * 20 + 20).map((row, i) => <ReviewItem key={row.sourceRow} row={row} onChange={updated => { setVerified(false); setReview(current => current!.map((value, index) => index === page * 20 + i ? updated : value)); }} />)}
        <div className="flex flex-wrap gap-3 items-center"><Button variant="secondary" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="text-sm">Page {page + 1} of {Math.ceil(review.length / 20)}</span><Button variant="secondary" disabled={(page + 1) * 20 >= review.length} onClick={() => setPage(value => value + 1)}>Next</Button></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={verified} onChange={event => setVerified(event.target.checked)} />I checked all included lines, medicine strength/form/pack, and quantities and rates in the inventory stock unit. Paid and free quantities are separate.</label>
        <Button disabled={!verified || !!issueCount || !selected.length || busy} onClick={useInvoice}>Use {selected.length} {selected.length === 1 ? 'line' : 'lines'} in purchase draft</Button>
        <p className="text-xs text-muted">Stock changes only after you confirm receipt and save the purchase. Enter the supplier invoice number and date above.</p>
      </div>}
    </>}
  </section>;
}
