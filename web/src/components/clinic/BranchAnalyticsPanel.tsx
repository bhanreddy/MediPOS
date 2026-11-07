import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatInr } from '../../lib/formatInr';
import { Card } from '../ui/Card';

type BranchMetrics = {
  invoices: number; net_sales: number; returns: number; stock_units: number; sellable_units: number;
  inventory_cost: number; inventory_mrp: number; purchase_value: number; cost_of_goods: number;
  recorded_expenses: number; operating_contribution: number; transfer_in_units: number; transfer_out_units: number;
};
type Result = {
  branches: Array<BranchMetrics & { id: string; name: string }>;
  totals: BranchMetrics;
  suppliers: Array<{ id: string; name: string; purchase_value: number; invoices: number }>;
};
const metrics: Array<[keyof BranchMetrics, string, boolean]> = [
  ['net_sales', 'Net billed sales', true], ['invoices', 'Invoices', false], ['returns', 'Returns', false],
  ['sellable_units', 'Sellable units', false], ['stock_units', 'On-hand units', false],
  ['inventory_cost', 'Stock at cost', true], ['inventory_mrp', 'Stock at MRP', true],
  ['purchase_value', 'Supplier purchases', true], ['cost_of_goods', 'Cost of goods', true],
  ['recorded_expenses', 'Recorded expenses', true], ['operating_contribution', 'Operating contribution', true],
  ['transfer_in_units', 'Units transferred in', false], ['transfer_out_units', 'Units transferred out', false],
];

export function BranchAnalyticsPanel({ from, to }: { from: string; to: string }) {
  const role = useAuth(state => state.role);
  const query = useQuery({
    queryKey: ['branch-analytics', from, to],
    enabled: role === 'OWNER' && !!from && !!to && from <= to,
    queryFn: async () => (await api.get('/branches/analytics', { params: { from, to } })).data.data as Result,
  });
  if (role !== 'OWNER') return null;
  return <Card className="space-y-4 p-5">
    <div>
      <h2 className="font-semibold">Branch performance</h2>
      <p className="text-sm text-muted">Compare branches over the selected dates. Stock is the current count. Operating contribution uses revenue before tax, cost of goods, and recorded branch expenses.</p>
    </div>
    {query.isFetching && <p role="status" className="text-sm">Loading branch metrics…</p>}
    {query.isError && <p role="alert" className="text-sm text-danger">Unable to load branch metrics for this date range.</p>}
    {query.data && <>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead><tr><th className="p-2 text-left">Branch</th>{metrics.map(([key, label]) => <th key={key} className="whitespace-nowrap p-2 text-right">{label}</th>)}</tr></thead>
          <tbody>
            {[{ ...query.data.totals, id: 'all', name: 'All branches' }, ...query.data.branches].map(row =>
              <tr key={row.id} className="border-t border-border">
                <th className="whitespace-nowrap p-2 text-left">{row.name}</th>
                {metrics.map(([key, _label, currency]) => <td className="whitespace-nowrap p-2 text-right tabular-nums" key={key}>
                  {currency ? formatInr(Number(row[key] ?? 0), 2) : Number(row[key] ?? 0).toLocaleString('en-IN')}
                </td>)}
              </tr>,
            )}
          </tbody>
        </table>
      </div>
      {!!query.data.suppliers.length && <section>
        <h3 className="font-semibold">Purchasing by supplier</h3>
        <ul className="mt-2 space-y-1 text-sm">{query.data.suppliers.map(supplier => <li className="flex justify-between gap-2" key={supplier.id}>
          <span>{supplier.name} · {supplier.invoices} invoices</span><span>{formatInr(Number(supplier.purchase_value), 2)}</span>
        </li>)}</ul>
      </section>}
    </>}
  </Card>;
}
