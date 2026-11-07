import { useState } from 'react';
import api from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const operations = [
  ['expiry', 'Expiry'],
  ['dead-stock', 'Dead stock'],
  ['slow-moving', 'Slow-moving stock'],
  ['employee-sales', 'Employee sales'],
  ['party-ledger', 'Party ledger'],
  ['customer-outstanding', 'Customer outstanding'],
  ['supplier-outstanding', 'Supplier outstanding'],
  ['valuation', 'Inventory valuation'],
  ['stock-movement', 'Stock movements'],
  ['returns', 'Returns and cancellations'],
] as const;

const registers = [
  ['prescription-register', 'Prescription register'],
  ['schedule-h1', 'Schedule H1 register'],
  ['schedule-x', 'Schedule X register'],
] as const;

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const title = (text: string) => text.replaceAll('_', ' ').replace(/^./, first => first.toUpperCase());
const cell = (value: unknown) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }
  return String(value);
};

export function PharmacyReportsPanel({ from, to }: { from: string; to: string }) {
  const role = useAuth(state => state.role);
  const allowed = role === 'OWNER' || role === 'PHARMACIST';
  const [selected, setSelected] = useState('');
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ columns: string[]; data: Array<Record<string, unknown>> }>();
  const [period, setPeriod] = useState(to.slice(0, 7));
  if (!allowed) return null;

  const isRegister = registers.some(([key]) => key === selected);
  const reportParams = { from, to, ...(!isRegister ? { kind: selected, days } : {}) };

  async function fetchReport(exportCsv: boolean) {
    if (!selected || !from || !to || from > to || busy) return;
    setError('');
    setWarnings([]);
    setBusy(true);
    const params = { ...reportParams, ...(exportCsv ? { format: 'csv' } : {}) };
    try {
      const options = { params, ...(exportCsv ? { responseType: 'text' as const } : {}) };
      const response = isRegister ? await api.get(`/reports/register/${selected}`, options) : await api.get('/reports/operations', options);
      if (exportCsv) download(response.data, `${selected}-${from}-${to}.csv`, 'text/csv;charset=utf-8');
      else setPreview(response.data);
    } catch (failure: any) {
      setError(failure.response?.data?.error?.message || 'Unable to generate this report.');
    } finally { setBusy(false); }
  }

  async function exportGstr() {
    if (!/^\d{4}-\d{2}$/.test(period) || busy) return;
    setBusy(true);
    setWarnings([]);
    setError('');
    try {
      const [year, month] = period.split('-').map(Number);
      const response = await api.get('/reports/gstr1-export', { params: { month, year } });
      setWarnings(response.data.warnings ?? []);
      download(JSON.stringify(response.data.data, null, 2), `gstr1-${period}.json`, 'application/json');
    } catch (failure: any) {
      setError(failure.response?.data?.error?.message || 'Unable to prepare the GSTR-1 export.');
    } finally { setBusy(false); }
  }

  return <Card className="space-y-4 p-5">
    <div>
      <h2 className="font-semibold">Pharmacy reports and exports</h2>
      <p className="text-sm text-muted">Reports use the date range above. The inventory lookback applies to expiry and stock movement frequency.</p>
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">Pharmacy report
        <select className="mt-1 block rounded border border-border bg-surface p-2" value={selected} onChange={event => {
          setSelected(event.target.value); setPreview(undefined);
        }}>
          <option value="">Choose a report</option>
          <optgroup label="Dispensing registers">{registers.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</optgroup>
          {role === 'OWNER' && <optgroup label="Operations">{operations.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</optgroup>}
        </select>
      </label>
      {['expiry', 'dead-stock', 'slow-moving'].includes(selected) && <label className="text-sm">Days
        <input type="number" min="1" max="730" value={days} onChange={event => setDays(Number(event.target.value))}
          className="mt-1 block w-24 rounded border border-border bg-surface p-2" />
      </label>}
      <Button type="button" disabled={!selected || busy} onClick={() => void fetchReport(false)}>Preview pharmacy report</Button>
      <Button type="button" variant="secondary" disabled={!selected || busy} onClick={() => void fetchReport(true)}>Download CSV</Button>
    </div>
    {preview && (preview.data.length ? <div className="max-h-96 overflow-auto rounded border border-border">
      <table className="min-w-full text-left text-xs">
        <thead><tr>{preview.columns.map(column => <th className="whitespace-nowrap border-b border-border p-2" key={column}>{title(column)}</th>)}</tr></thead>
        <tbody>{preview.data.slice(0, 100).map((row, index) => <tr className="border-b border-border" key={index}>
          {preview.columns.map(column => <td className="min-w-24 p-2" key={column}>{cell(row[column])}</td>)}
        </tr>)}</tbody>
      </table>
      {preview.data.length > 100 && <p className="p-2 text-xs">Showing 100 of {preview.data.length} records. The CSV contains all records.</p>}
    </div> : <p className="text-sm text-muted">No records match this report.</p>)}
    {role === 'OWNER' && <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <label className="text-sm">GSTR-1 filing month
        <input type="month" value={period} onChange={event => setPeriod(event.target.value)} className="mt-1 block rounded border border-border bg-surface p-2" />
      </label>
      <Button type="button" variant="secondary" disabled={!period || busy} onClick={() => void exportGstr()}>Download GSTR-1 preparation JSON</Button>
    </div>}
    {warnings.length > 0 && <ul className="list-disc pl-5 text-sm text-warning">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </Card>;
}
