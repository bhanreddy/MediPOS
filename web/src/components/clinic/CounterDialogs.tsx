import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatInr } from '../../lib/formatInr';
import type { PosCartLine } from '../../store/posStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

const inputClass = 'rounded-lg border border-border bg-surface px-3 py-2';
export const counterError = (error: any, fallback: string) => error.response?.data?.error?.message ?? fallback;

export interface CounterBatch {
  id: string;
  batch_number: string;
  expiry_date: string;
  available_quantity: number;
  mrp: number;
  selling_price: number;
}

export function CounterBatchDialog({ line, onSelect, onClose }: {
  line: PosCartLine;
  onSelect: (batch: CounterBatch | null) => void;
  onClose: () => void;
}) {
  const batches = useQuery({
    queryKey: ['pos-batches', line.medicine_id],
    queryFn: async () => (await api.get(`/sales/medicine/${line.medicine_id}/batches`)).data.data as CounterBatch[],
  });
  return <Modal isOpen onClose={onClose} title={`Choose batch · ${line.medicine_name}`}>
    <Button variant="secondary" onClick={() => onSelect(null)}>Use automatic FEFO</Button>
    {batches.isPending && <p className="mt-3 text-sm">Checking available batches…</p>}
    {batches.isError && <p role="alert" className="mt-3 text-danger">Unable to load available batches.</p>}
    {batches.data?.length === 0 && <p className="mt-3 text-sm">No batches are eligible.</p>}
    <ul className="mt-3 space-y-2">
      {batches.data?.map(batch => <li key={batch.id}>
        <button type="button" onClick={() => onSelect(batch)} disabled={batch.available_quantity < line.quantity}
          className="w-full rounded-lg border border-border p-3 text-left hover:border-primary disabled:opacity-50">
          <strong>{batch.batch_number}</strong>
          <span className="block text-sm text-muted">Expires {batch.expiry_date.slice(0, 10)} · {batch.available_quantity} available · MRP {formatInr(batch.mrp, 2)}</span>
          {batch.selling_price !== batch.mrp && <span className="text-sm">Selling price {formatInr(batch.selling_price, 2)}</span>}
        </button>
      </li>)}
    </ul>
  </Modal>;
}

export interface ParkedBill {
  id: string;
  park_token: string;
  status: string;
  cart_snapshot: PosCartLine[];
  customer_snapshot: { id?: string; name?: string; phone?: string };
  totals_snapshot: {
    bill_discount?: string; is_percentage_discount?: boolean; discount_reason?: string;
    payment_mode?: 'cash' | 'upi' | 'card' | 'credit' | 'mixed'; paid_amount?: string;
    payments?: Array<{ tender_type: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'WALLET'; amount: number; reference_number?: string }>;
  };
  cashier_name?: string;
  created_at: string;
}

export function ParkedBillsDialog({ hasCurrentBill, onResume, onClose }: {
  hasCurrentBill: boolean;
  onResume: (bill: ParkedBill) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const rows = useQuery({
    queryKey: ['parked-bills', search],
    queryFn: async () => (await api.get('/pos/parked', { params: { q: search } })).data.data as ParkedBill[],
  });

  async function action(id: string, kind: 'resume' | 'cancel') {
    setBusy(true);
    setError('');
    try {
      if (kind === 'resume') {
        const response = await api.post(`/pos/parked/${id}/resume`);
        onResume(response.data.data);
      } else {
        await api.post(`/pos/parked/${id}/cancel`);
        setCancelId(null);
        void rows.refetch();
      }
    } catch (failure) {
      setError(counterError(failure, 'Unable to update this parked bill.'));
    } finally {
      setBusy(false);
    }
  }
  return <Modal isOpen onClose={onClose} title="Parked bills">
    <label className="block text-sm">Search parked bills
      <input type="search" className={`${inputClass} mt-1 block w-full`} value={search} onChange={event => setSearch(event.target.value)} />
    </label>
    {rows.isPending && <p className="mt-3 text-sm">Loading parked bills…</p>}
    {rows.isError && <p role="alert" className="mt-3 text-danger">Unable to load parked bills.</p>}
    {rows.data?.length === 0 && <p className="mt-3 text-sm">No parked bills match.</p>}
    <ul className="mt-3 space-y-3">
      {rows.data?.map(bill => <li key={bill.id} className="rounded-lg border border-border p-3">
        <p><strong>{bill.park_token}</strong> · {bill.customer_snapshot.name || 'Walk-in'} · {bill.cart_snapshot.length} lines</p>
        <p className="text-sm text-muted">{bill.cashier_name || 'Cashier'} · {new Date(bill.created_at).toLocaleString()}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void action(bill.id, 'resume')}>
            {hasCurrentBill ? 'Resume and replace current cart' : 'Resume bill'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setCancelId(bill.id)}>Cancel bill</Button>
          {cancelId === bill.id && <Button variant="danger" disabled={busy} onClick={() => void action(bill.id, 'cancel')}>Confirm cancellation</Button>}
        </div>
      </li>)}
    </ul>
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
  </Modal>;
}

interface Approval {
  id: string;
  cashier_name: string;
  checkout_request_id: string;
  approved_at: string | null;
  discount_paise: number;
  reason: string;
}

interface DiscountEmployee {
  id: string;
  full_name: string;
  max_basis_points: number;
}

export function CounterApprovalsDialog({ isOwner, checkoutId, onUse, onClose }: {
  isOwner: boolean;
  checkoutId: string;
  onUse: (approvalId: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const approvals = useQuery({
    queryKey: ['counter-discount-approvals'],
    queryFn: async () => (await api.get('/counter/discount-approvals')).data.data as Approval[],
  });
  const employees = useQuery({
    queryKey: ['counter-discount-employees'],
    enabled: isOwner,
    queryFn: async () => (await api.get('/counter/discount-employees')).data.data as DiscountEmployee[],
  });

  async function approve(id: string) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/counter/discount-approvals/${id}/approve`);
      await approvals.refetch();
    } catch (failure) {
      setError(counterError(failure, 'Unable to approve this discount.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveLimit(id: string) {
    const input = limits[id];
    if (!input?.trim() || Number(input) < 0 || Number(input) > 100) return;
    setBusy(true);
    setError('');
    try {
      await api.put(`/counter/discount-employees/${id}`, { max_basis_points: Math.round(Number(input) * 100) });
      await employees.refetch();
    } catch (failure) {
      setError(counterError(failure, 'Unable to update this discount limit.'));
    } finally {
      setBusy(false);
    }
  }

  return <Modal isOpen onClose={onClose} title="Discount approvals">
    <button type="button" className="text-sm font-semibold text-primary" onClick={() => void approvals.refetch()}>Refresh approvals</button>
    {approvals.isError && <p role="alert" className="text-danger">Unable to load requests.</p>}
    {approvals.data?.length === 0 && <p className="mt-2 text-sm">No pending requests.</p>}
    <ul className="mt-2 space-y-2">
      {approvals.data?.map(row => <li key={row.id} className="rounded-lg border border-border p-3">
        <p><strong>{row.cashier_name}</strong> · {formatInr(Number(row.discount_paise) / 100, 2)}</p>
        <p className="text-sm">{row.reason}</p>
        {row.approved_at ? <p className="mt-1 text-sm text-success">Approved</p> : <p className="mt-1 text-sm text-muted">Awaiting owner</p>}
        {isOwner && !row.approved_at && <Button className="mt-2" disabled={busy} onClick={() => void approve(row.id)}>Approve discount</Button>}
        {!isOwner && row.approved_at && row.checkout_request_id === checkoutId &&
          <Button className="mt-2" onClick={() => onUse(row.id)}>Apply approval to current bill</Button>}
      </li>)}
    </ul>
    {isOwner && <div className="mt-4 border-t border-border pt-3">
      <h3 className="font-semibold">Employee discount limits</h3>
      {employees.data?.map(employee => <form className="mt-2 flex items-end gap-2" key={employee.id}
        onSubmit={event => { event.preventDefault(); void saveLimit(employee.id); }}>
        <label className="min-w-0 flex-1 text-sm">{employee.full_name} (%)
          <input type="number" required min="0" max="100" step="0.01" className={`${inputClass} block w-full`}
            value={limits[employee.id] ?? Number(employee.max_basis_points) / 100}
            onChange={event => setLimits(previous => ({ ...previous, [employee.id]: event.target.value }))} />
        </label>
        <Button type="submit" variant="secondary" disabled={busy}>Save</Button>
      </form>)}
    </div>}
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
  </Modal>;
}
