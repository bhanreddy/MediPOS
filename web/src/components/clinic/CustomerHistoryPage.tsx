import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, ChevronDown, History, Pill, Printer, RefreshCw, UserRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { CustomerHistoryService, HISTORY_PAGE_SIZE, type CustomerInvoice } from '../../services/customerHistoryService';
import { useAuth } from '../../lib/auth';
import { usePosStore } from '../../store/posStore';
import type { Sale, SaleItem } from '../../core/types';
import { formatInr } from '../../lib/formatInr';
import { CustomerWallet } from './CustomerWallet';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { LoadError, Pagination } from '../ui/ListFeedback';

function dateLabel(value?: string, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function CustomerHistoryPage() {
  const { id = '' } = useParams();
  return <CustomerHistory key={id} id={id} />;
}

function CustomerHistory({ id }: { id: string }) {
  const navigate = useNavigate();
  const scope = useAuth(s => `${s.user?.id}:${s.clinic_id}`);
  const cartCount = usePosStore(s => s.cart.length);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [medicineQuery, setMedicineQuery] = useState('');
  const [medicineTerm, setMedicineTerm] = useState('');
  const [medicine, setMedicine] = useState<{ id: string; name: string } | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setMedicineTerm(medicineQuery.trim()), 200);
    return () => clearTimeout(timer);
  }, [medicineQuery]);

  const customer = useQuery({
    queryKey: ['customer-history-profile', scope, id],
    queryFn: ({ signal }) => CustomerHistoryService.getCustomer(id, signal),
    enabled: !!id,
  });
  const invalidDates = !!from && !!to && from > to;
  const history = useQuery({
    queryKey: ['customer-history', scope, customer.data?.id, page, from, to, medicine?.id],
    queryFn: ({ signal }) => CustomerHistoryService.getHistory(customer.data!, { page, from, to, medicineId: medicine?.id }, signal),
    enabled: !!customer.data && !invalidDates,
  });
  const medicines = useQuery({
    queryKey: ['customer-history-medicines', scope, medicineTerm],
    queryFn: ({ signal }) => CustomerHistoryService.findMedicines(medicineTerm, signal),
    enabled: medicineTerm.length >= 2 && !medicine,
  });

  const printInvoice = async (invoice: CustomerInvoice) => {
    if (printingId || !customer.data) return;
    setPrintingId(invoice.id);
    try {
      const { PrinterService } = await import('../../services/printerService');
      await PrinterService.printBill(
        { ...invoice, customers: { name: customer.data.name, phone: customer.data.phone } } as unknown as Sale,
        invoice.sale_items as unknown as SaleItem[],
      );
    } catch { toast.error('Unable to print this invoice. Please try again.'); }
    finally { setPrintingId(null); }
  };

  if (customer.isPending) return <div role="status" className="p-6">Loading customer history…</div>;
  if (customer.isError || !customer.data) return <div className="space-y-5 p-6"><Link to="/customers">← Customers</Link><LoadError onRetry={() => void customer.refetch()} /></div>;
  const profile = customer.data;
  const filtered = !!from || !!to || !!medicine;

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <Link to="/customers" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-primary"><ArrowLeft size={16} aria-hidden /> Customers</Link>
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border bg-primary/5 p-5 sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><UserRound size={26} aria-hidden /></span>
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Customer purchase history</p>
            <h1 className="mt-1 break-words text-2xl font-bold text-foreground-strong">{profile.name}</h1>
            <p className="mt-1 break-words text-sm text-muted">{profile.phone || 'No phone saved'}{profile.email ? ` · ${profile.email}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={history.isFetching} onClick={() => { void customer.refetch(); void history.refetch(); }}><RefreshCw size={14} aria-hidden /> Refresh</Button>
          <Button size="sm" onClick={() => { usePosStore.getState().setCustomer(profile.id, profile.name, profile.phone); navigate('/billing/new'); }}>{cartCount ? 'Use for current bill' : 'New bill'}<ArrowUpRight size={14} aria-hidden /></Button>
        </div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
        <div><p className="text-xs font-semibold text-muted">{filtered ? 'Matching transactions' : 'Bills & returns'}</p><p className="mt-1 text-2xl font-bold tabular-nums">{history.isSuccess && !invalidDates ? history.data.total : '—'}</p></div>
        <div><p className="text-xs font-semibold text-muted">Current outstanding</p><p className="mt-1 text-2xl font-bold tabular-nums text-warning">{formatInr(profile.outstanding_balance ?? profile.credit_balance ?? 0, 2)}</p></div>
        <div><p className="text-xs font-semibold text-muted">History scope</p><p className="mt-2 text-sm font-semibold">This medical store only</p><p className="mt-1 text-xs text-muted">Saved automatically with every linked bill.</p></div>
      </div>
    </Card>

    <CustomerWallet key={profile.id} customerId={profile.id} />

    <section aria-labelledby="purchase-timeline-heading" className="space-y-4">
      <div className="flex items-center gap-2"><History size={20} className="text-primary" aria-hidden /><h2 id="purchase-timeline-heading" className="text-lg font-bold">Purchase timeline</h2></div>
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="grid items-start gap-3 sm:grid-cols-3">
          <div className="relative">
            {medicine ? <div><p className="mb-1 text-sm font-semibold">Medicine</p><Button variant="secondary" className="w-full justify-between" onClick={() => { setMedicine(null); setMedicineQuery(''); setPage(1); }}>{medicine.name}<X size={14} aria-label="Clear medicine filter" /></Button></div> : <>
              <Input label="Medicine" placeholder="Find a medicine…" value={medicineQuery} onChange={e => setMedicineQuery(e.target.value)} autoComplete="off" />
              {medicineTerm.length >= 2 && <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
                {medicines.isPending || medicineTerm !== medicineQuery.trim() ? <p className="p-3 text-xs text-muted">Finding medicines…</p> : medicines.isError ? <Button variant="ghost" onClick={() => void medicines.refetch()}>Retry medicine search</Button> : medicines.data?.length ? medicines.data.map(hit => <button key={hit.id} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-primary/10" onClick={() => { setMedicine(hit); setMedicineQuery(''); setPage(1); }}>{hit.name}</button>) : <p className="p-3 text-xs text-muted">No medicines match this name.</p>}
              </div>}
            </>}
          </div>
          <Input label="From date" type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setPage(1); }} />
          <Input label="To date" type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setPage(1); }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">All linked purchases, including older bills. Open a bill for medicine and batch details.</p>{(filtered || medicineQuery) && <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setMedicine(null); setMedicineQuery(''); setPage(1); }}>Clear filters</Button>}</div>
      </Card>
      {invalidDates ? <p role="alert" className="text-sm text-danger">From date must be before the to date.</p> : history.isPending ? <Card className="p-8 text-center text-muted" role="status">Loading purchase history…</Card> : history.isError ? <LoadError onRetry={() => void history.refetch()} /> : history.data.invoices.length === 0 ? <Card className="p-10 text-center"><Pill size={28} className="mx-auto mb-3 text-muted" aria-hidden /><p className="font-semibold">{filtered ? 'No purchases match these filters' : 'No linked purchases yet'}</p><p className="mx-auto mt-2 max-w-md text-sm text-muted">{filtered ? 'Try another medicine or date range.' : 'Select this customer when billing. Every completed bill will appear here with its medicines. Earlier walk-in bills cannot be matched automatically.'}</p></Card> : <>
        <div className="space-y-3">{history.data.invoices.map((invoice, index) => <details key={invoice.id} open={index === 0} className="group overflow-hidden rounded-2xl border border-border bg-surface">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-foreground-strong">{invoice.invoice_number || 'Invoice'}</span><Badge variant={invoice.is_return ? 'warning' : invoice.payment_status === 'paid' ? 'success' : 'neutral'}>{invoice.is_return ? 'Return' : invoice.payment_status === 'paid' ? 'Paid' : invoice.payment_status === 'partial' ? 'Part paid' : 'Credit'}</Badge></div><p className="mt-1 text-xs text-muted">{dateLabel(invoice.created_at, true)} · {invoice.sale_items.length} medicine {invoice.sale_items.length === 1 ? 'line' : 'lines'} · {invoice.payment_mode?.toUpperCase()}</p><p className="mt-2 text-sm text-muted">{invoice.sale_items.slice(0, 2).map(item => item.medicines?.name || 'Medicine').join(', ')}{invoice.sale_items.length > 2 ? ` +${invoice.sale_items.length - 2} more` : ''}</p></div>
            <div className="flex items-center gap-4"><span className="font-bold tabular-nums">{invoice.is_return ? '−' : ''}{formatInr(invoice.net_amount, 2)}</span><ChevronDown size={18} className="text-muted transition-transform group-open:rotate-180" aria-hidden /></div>
          </summary>
          <div className="border-t border-border">
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Medicines on invoice {invoice.invoice_number}</caption><thead className="bg-surface-elevated text-xs text-muted"><tr><th className="px-4 py-3 font-semibold">Medicine / batch</th><th className="px-3 py-3 text-right font-semibold">Qty</th><th className="px-3 py-3 text-right font-semibold">Rate</th><th className="px-3 py-3 text-right font-semibold">Disc.</th><th className="px-3 py-3 text-right font-semibold">GST</th><th className="px-4 py-3 text-right font-semibold">Amount</th></tr></thead><tbody className="divide-y divide-border">{invoice.sale_items.map(item => <tr key={item.id} className={medicine?.id === item.medicine_id ? 'bg-primary/5' : ''}><td className="min-w-44 px-4 py-3"><p className="font-semibold">{item.medicines?.name || 'Medicine unavailable'}</p><p className="mt-1 text-xs text-muted">Batch {item.medicine_batches?.batch_number || '—'} · Exp {dateLabel(item.medicine_batches?.expiry_date)}</p></td><td className="px-3 py-3 text-right tabular-nums">{Number(item.quantity)}</td><td className="px-3 py-3 text-right tabular-nums">{formatInr(item.unit_price, 2)}</td><td className="px-3 py-3 text-right tabular-nums">{item.discount_pct == null ? '—' : `${Number(item.discount_pct)}%`}</td><td className="px-3 py-3 text-right tabular-nums">{item.gst_rate == null ? '—' : `${Number(item.gst_rate)}%`}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatInr(item.total, 2)}</td></tr>)}</tbody></table></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-elevated/50 p-4"><p className="text-xs text-muted">{invoice.is_return ? 'Refund recorded' : `Received ${formatInr(Number(invoice.paid_amount)-(Number(invoice.wallet_redeemed_paise||0)/100), 2)} · Invoice due ${formatInr(invoice.balance_due, 2)}`}{Number(invoice.wallet_redeemed_paise||0)>0&&` · Nex Coins ${formatInr(Number(invoice.wallet_redeemed_paise)/100,2)}${invoice.is_return?' restored':''}`}{Number(invoice.nex_coins_earned_paise||0)>0&&` · Earned ${Number(invoice.nex_coins_earned_paise)/100} Nex Coins`}</p><Button variant="secondary" size="sm" isLoading={printingId === invoice.id} disabled={!!printingId} onClick={() => void printInvoice(invoice)}><Printer size={14} aria-hidden /> Reprint invoice</Button></div>
          </div>
        </details>)}</div>
        <Pagination page={page} limit={HISTORY_PAGE_SIZE} total={history.data.total} busy={history.isFetching} onPage={setPage} />
      </>}
    </section>
  </div>;
}
