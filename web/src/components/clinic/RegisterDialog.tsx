import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatInr } from '../../lib/formatInr';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface Session {
  id: string;
  opened_at: string;
  closed_at?: string;
}

interface Report {
  kind: 'X' | 'Z';
  opening_paise: number;
  cash_sales_paise: number;
  cash_refunds_paise: number;
  cash_in_paise: number;
  cash_out_paise: number;
  drops_paise: number;
  expenses_paise: number;
  expected_paise: number;
  actual_paise: number | null;
  variance_paise: number | null;
  tenders: Array<{ tender_type: string; sales_paise: number; refunds_paise: number }>;
}

const fields: Array<[keyof Report, string]> = [
  ['opening_paise', 'Opening float'], ['cash_sales_paise', 'Cash sales'], ['cash_refunds_paise', 'Cash refunds'],
  ['cash_in_paise', 'Cash in'], ['cash_out_paise', 'Cash out'], ['drops_paise', 'Cash drops'],
  ['expenses_paise', 'Drawer expenses'], ['expected_paise', 'Expected cash'], ['actual_paise', 'Counted cash'],
  ['variance_paise', 'Variance'],
];
const inputClass = 'block w-full rounded-lg border border-border bg-surface px-3 py-2';
const money = (paise: number) => formatInr(paise / 100, 2);

export function RegisterDialog({ session, onChange, onClose }: {
  session: Session | null;
  onChange: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState('CASH_IN');
  const [operation, setOperation] = useState<'movement' | 'close'>('movement');
  const [reportId, setReportId] = useState<string | null>(session?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef({ signature: '', id: '' });
  const history = useQuery({
    queryKey: ['register-history'],
    queryFn: async () => (await api.get('/register/history')).data.data as Session[],
  });
  const report = useQuery({
    queryKey: ['register-report', reportId],
    enabled: !!reportId,
    queryFn: async () => (await api.get(`/register/${reportId}/report`)).data.data as Report,
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const paise = Math.round(Number(amount) * 100);
    if (busy || !amount.trim() || !Number.isSafeInteger(paise) || paise < 0) return;
    const signature = JSON.stringify({ amount, kind, reason, operation, session: session?.id });
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      if (!session) {
        const opened = await api.post('/register/open', { request_id: request.current.id, opening_paise: paise });
        setReportId(opened.data.data.id);
      } else if (operation === 'close') {
        await api.post(`/register/${session.id}/close`, { closing_paise: paise });
        setReportId(session.id);
      } else {
        await api.post(`/register/${session.id}/movements`, {
          request_id: request.current.id, amount_paise: paise, kind, reason,
        });
      }
      setAmount('');
      setReason('');
      request.current = { signature: '', id: '' };
      onChange();
      if (reportId) void report.refetch();
      void history.refetch();
    } catch (failure: any) {
      setError(failure.response?.data?.error?.message ?? 'Unable to update the register. Retry to keep the same request.');
    } finally {
      setBusy(false);
    }
  }

  return <Modal isOpen onClose={onClose} title="Cash register">
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted">{session ? 'This drawer records payments and refunds made during your shift.' : 'Enter the counted float to open your drawer.'}</p>
      {session && <label className="block text-sm">Register action
        <select className={inputClass} value={operation} onChange={event => { setAmount(''); setOperation(event.target.value as typeof operation); }}>
          <option value="movement">Record a cash movement</option>
          <option value="close">Close shift and generate Z report</option>
        </select>
      </label>}
      {session && operation === 'movement' && <label className="block text-sm">Movement type
        <select className={inputClass} value={kind} onChange={event => setKind(event.target.value)}>
          <option value="CASH_IN">Cash in</option><option value="CASH_OUT">Cash out</option>
          <option value="DROP">Cash drop</option><option value="EXPENSE">Drawer expense</option>
        </select>
      </label>}
      <label className="block text-sm">{!session ? 'Opening float (₹)' : operation === 'close' ? 'Closing cash count (₹)' : 'Amount (₹)'}
        <input className={inputClass} type="number" min={session && operation === 'movement' ? '0.01' : '0'} step="0.01"
          required value={amount} onChange={event => setAmount(event.target.value)} />
      </label>
      {session && operation === 'movement' && <label className="block text-sm">Reason
        <input className={inputClass} maxLength={400} required value={reason} onChange={event => setReason(event.target.value)} />
      </label>}
      <Button type="submit" disabled={busy}>{!session ? 'Open shift' : operation === 'close' ? 'Close shift' : 'Record movement'}</Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
    {!!history.data?.length && <label className="mt-5 block text-sm">Shift report
      <select className={inputClass} value={reportId ?? ''} onChange={event => setReportId(event.target.value || null)}>
        <option value="">Choose a shift</option>
        {history.data.map(row => <option value={row.id} key={row.id}>{new Date(row.opened_at).toLocaleString()} · {row.closed_at ? 'Closed' : 'Open'}</option>)}
      </select>
    </label>}
    {report.isError && <p role="alert" className="mt-3 text-sm text-danger">Unable to load this shift report.</p>}
    {report.data && <section className="mt-4 rounded-lg border border-border p-3" aria-label="Register reconciliation">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{report.data.kind} report</h3>
        <button type="button" className="text-sm font-semibold text-primary" onClick={() => void report.refetch()}>Refresh report</button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
        {fields.map(([key, label]) => {
          const value = report.data[key];
          return typeof value === 'number' ? <div key={key} className="contents"><dt>{label}</dt><dd className="text-right">{money(value)}</dd></div> : null;
        })}
      </dl>
      <ul className="mt-2 border-t border-border pt-2 text-sm">
        {report.data.tenders.map(tender => <li key={tender.tender_type}>
          {tender.tender_type}: {money(tender.sales_paise)} received · {money(tender.refunds_paise)} reversed
        </li>)}
      </ul>
    </section>}
  </Modal>;
}
