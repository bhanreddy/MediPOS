import { queryRaw } from '../lib/postgresDb';

export async function branchAnalytics(clinicId: string, from: string, to: string) {
  const args = [clinicId, from, to];
  const data = await queryRaw(
    `WITH branches AS (
      SELECT id, COALESCE(display_name,name) AS name FROM stores WHERE clinic_id=? AND deleted_at IS NULL
    ), sales_period AS (
      SELECT s.id,s.store_id,s.is_return,s.net_amount,s.gst_amount FROM sales s JOIN branches st ON st.id=s.store_id
      WHERE s.deleted_at IS NULL AND s.clinic_id=(SELECT clinic_id FROM stores WHERE id=st.id)
        AND s.created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')
        AND s.created_at < ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
    ), revenue AS (
      SELECT store_id, COUNT(*) FILTER (WHERE NOT COALESCE(is_return,false))::int AS invoices,
        COUNT(*) FILTER (WHERE is_return)::int AS returns,
        SUM(CASE WHEN is_return THEN -ABS(net_amount) ELSE net_amount END) AS net_sales,
        SUM(CASE WHEN is_return THEN -ABS(net_amount-gst_amount) ELSE net_amount-gst_amount END) AS revenue_excluding_tax
      FROM sales_period GROUP BY store_id
    ), costs AS (
      SELECT s.store_id,
        SUM(CASE WHEN s.is_return THEN -ABS(i.quantity) ELSE i.quantity END *
          COALESCE((i.invoice_line_snapshot->>'unit_cost_paise')::numeric/100.0,mb.purchase_price,0)) AS cogs
      FROM sales_period s JOIN sale_items i ON i.sale_id=s.id AND i.deleted_at IS NULL
      LEFT JOIN medicine_batches mb ON mb.id=i.batch_id AND mb.clinic_id=i.clinic_id
      WHERE NOT COALESCE(s.is_return,false) OR i.restock_decision='RESTOCK'
      GROUP BY s.store_id
    ), stock AS (
      SELECT p.store_id,SUM(p.available)::int AS sellable_units,SUM(p.on_hand)::int AS stock_units,
        SUM(p.on_hand*p.purchase_price) AS inventory_cost,SUM(p.on_hand*p.mrp) AS inventory_mrp
      FROM branch_stock_snapshot p JOIN branches b ON b.id=p.store_id GROUP BY p.store_id
    ), purchasing AS (
      SELECT p.store_id, SUM(p.net_amount) AS purchase_value, COUNT(*)::int AS purchase_invoices
      FROM purchases p JOIN branches b ON b.id=p.store_id WHERE p.deleted_at IS NULL
        AND p.created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')
        AND p.created_at < ((?::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata') GROUP BY p.store_id
    ), expenses_period AS (
      SELECT e.store_id, SUM(e.amount) AS recorded_expenses
      FROM expenses e JOIN branches b ON b.id=e.store_id WHERE e.deleted_at IS NULL
        AND e.created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')
        AND e.created_at < ((?::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata') GROUP BY e.store_id
    ), movement AS (
      SELECT l.store_id,
        SUM(l.quantity_delta) FILTER (WHERE l.movement_type='TRANSFER_IN')::int AS transfer_in_units,
        -SUM(l.quantity_delta) FILTER (WHERE l.movement_type='TRANSFER_OUT')::int AS transfer_out_units
      FROM stock_ledger l JOIN branches b ON b.id=l.store_id WHERE l.deleted_at IS NULL
        AND l.movement_type IN ('TRANSFER_IN','TRANSFER_OUT')
        AND l.created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')
        AND l.created_at < ((?::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata') GROUP BY l.store_id
    )
    SELECT b.id,b.name,COALESCE(r.invoices,0) AS invoices,COALESCE(r.returns,0) AS returns,
      COALESCE(r.net_sales,0) AS net_sales,COALESCE(r.revenue_excluding_tax,0) AS revenue_excluding_tax,
      COALESCE(c.cogs,0) AS cost_of_goods,COALESCE(e.recorded_expenses,0) AS recorded_expenses,
      COALESCE(r.revenue_excluding_tax,0)-COALESCE(c.cogs,0)-COALESCE(e.recorded_expenses,0) AS operating_contribution,
      COALESCE(st.sellable_units,0) AS sellable_units,COALESCE(st.stock_units,0) AS stock_units,
      COALESCE(st.inventory_cost,0) AS inventory_cost,COALESCE(st.inventory_mrp,0) AS inventory_mrp,
      COALESCE(p.purchase_value,0) AS purchase_value,COALESCE(p.purchase_invoices,0) AS purchase_invoices,
      COALESCE(m.transfer_in_units,0) AS transfer_in_units,COALESCE(m.transfer_out_units,0) AS transfer_out_units
    FROM branches b LEFT JOIN revenue r ON r.store_id=b.id LEFT JOIN costs c ON c.store_id=b.id
    LEFT JOIN stock st ON st.store_id=b.id LEFT JOIN purchasing p ON p.store_id=b.id
    LEFT JOIN expenses_period e ON e.store_id=b.id LEFT JOIN movement m ON m.store_id=b.id ORDER BY b.name,b.id`,
    [...args, from, to, from, to, from, to],
  );
  const suppliers = await queryRaw(
    `SELECT v.id,v.name,SUM(p.net_amount) AS purchase_value,COUNT(*)::int AS invoices
     FROM purchases p JOIN suppliers v ON v.id=p.supplier_id AND v.clinic_id=p.clinic_id
     WHERE p.clinic_id=? AND p.deleted_at IS NULL
       AND p.created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')
       AND p.created_at < ((?::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
     GROUP BY v.id,v.name ORDER BY purchase_value DESC,v.name`, args,
  );
  const branches = data.map(({id,name,...values}) => ({
    id, name, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])),
  }));
  const totals: Record<string, number> = {};
  for (const {id: _id,name: _name,...metrics} of branches) {
    for (const [key, value] of Object.entries(metrics)) totals[key] = Math.round(((totals[key] ?? 0) + Number(value)) * 100) / 100;
  }
  return { branches, totals, suppliers };
}
