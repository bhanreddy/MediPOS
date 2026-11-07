import { z } from 'zod';
import { AppError } from '../lib/appError';
import { queryRaw } from '../lib/postgresDb';

const dates = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });
export function reportDates(query: unknown) {
  const { from, to } = dates.parse(query);
  if (from && to && from > to) throw new AppError(400, 'The report start date follows its end date.');
  return [from ?? null, to ?? null] as const;
}

const from = "(?::date IS NULL OR DATE(event_date AT TIME ZONE 'Asia/Kolkata') >= ?::date)";
const to = "(?::date IS NULL OR DATE(event_date AT TIME ZONE 'Asia/Kolkata') <= ?::date)";

export async function statutoryRegister(clinicId: string, storeId: string, register: 'prescription' | 'h1' | 'x', query: unknown) {
  const [first, last] = reportDates(query);
  const classifications = register === 'h1' ? ['SCHEDULE_H1'] : register === 'x' ? ['SCHEDULE_X'] : ['PRESCRIPTION','SCHEDULE_H','SCHEDULE_H1'];
  return queryRaw(
    `SELECT l.classification, s.invoice_number, d.supplied_at AS sale_date,
       d.evidence->>'patient_name' AS patient_name, d.evidence->>'patient_address' AS patient_address,
       d.evidence->>'prescriber_name' AS prescriber_name, d.evidence->>'prescriber_address' AS prescriber_address,
       d.evidence->>'prescriber_registration' AS prescriber_registration,
       d.evidence->>'prescription_number' AS prescription_number, d.evidence->>'prescribed_at' AS written_date,
       d.evidence->>'pharmacist_name' AS pharmacist_name, d.evidence->>'pharmacist_registration' AS pharmacist_registration,
       d.evidence->>'pharmacist_authority' AS pharmacist_authority,
       d.evidence->>'prescription_register' AS prescription_register,
       d.evidence->>'h1_register' AS h1_register, d.evidence->>'x_register_page' AS x_register_page,
       d.evidence->>'x_duplicate_reference' AS x_duplicate_reference,
       d.evidence->>'schedule_x_licence' AS schedule_x_licence,
       l.evidence->>'medicine_name' AS medicine_name, l.evidence->>'manufacturer' AS manufacturer,
       l.evidence->>'batch_number' AS batch_number, l.evidence->>'expiry_date' AS expiry_date,
       l.evidence->>'prescribed_dose' AS prescribed_dose, l.quantity, l.retain_at_least_until,
       l.evidence->>'quantity_in' AS inward_quantity, l.evidence->>'supplier_name' AS supplier_name,
       l.evidence->>'supplier_address' AS supplier_address, l.evidence->>'supplier_licence' AS supplier_licence,
       l.evidence->>'purchase_invoice' AS purchase_invoice, l.evidence->>'purchase_date' AS purchase_date
     FROM regulated_dispensing d JOIN regulated_dispensing_lines l ON l.dispensing_id = d.id
     JOIN sales s ON s.id = d.sale_id AND s.clinic_id = d.clinic_id
     WHERE d.clinic_id = ? AND d.store_id = ? AND l.classification = ANY(?::text[])
       AND ${from.replace('event_date', 'd.supplied_at')} AND ${to.replace('event_date', 'd.supplied_at')}
     ORDER BY d.supplied_at, s.invoice_number, l.sale_item_id`,
    [clinicId, storeId, classifications, first, first, last, last],
  );
}

const operation = z.enum(['expiry','dead-stock','slow-moving','employee-sales','party-ledger','customer-outstanding',
  'supplier-outstanding','valuation','stock-movement','returns']);
export async function operationalReport(clinicId: string, storeId: string | null, query: Record<string, unknown>) {
  const kind = operation.parse(query.kind);
  const [first, last] = reportDates(query);
  const dateArgs = [first, first, last, last];
  const days = z.coerce.number().int().min(1).max(730).default(90).parse(query.days);
  const scopedBatch = 'b.clinic_id = ? AND (?::uuid IS NULL OR b.store_id = ?::uuid)';
  switch (kind) {
    case 'expiry':
      return queryRaw(
        `SELECT m.name AS medicine, b.batch_number, b.expiry_date, b.quantity_remaining AS units,
                b.is_disposed, st.name AS store
         FROM medicine_batches b JOIN medicines m ON m.id = b.medicine_id AND m.clinic_id = b.clinic_id
         LEFT JOIN stores st ON st.id = b.store_id
         WHERE ${scopedBatch} AND b.deleted_at IS NULL AND NOT b.is_disposed
           AND b.quantity_remaining > 0 AND b.expiry_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date + ?::integer
         ORDER BY b.expiry_date, m.name`, [clinicId, storeId, storeId, days],
      );
    case 'dead-stock':
    case 'slow-moving':
      return queryRaw(
        `WITH stock AS (
           SELECT b.medicine_id, SUM(b.quantity_remaining) AS available_units
           FROM medicine_batches b WHERE ${scopedBatch} AND b.deleted_at IS NULL AND NOT b.is_disposed
             AND b.expiry_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date GROUP BY b.medicine_id
         ), movement AS (
           SELECT i.medicine_id, SUM(CASE WHEN s.is_return THEN -i.quantity ELSE i.quantity END) AS units_sold
           FROM sale_items i JOIN sales s ON s.id=i.sale_id AND s.clinic_id=i.clinic_id
           WHERE s.clinic_id=? AND (?::uuid IS NULL OR s.store_id=?::uuid)
             AND s.deleted_at IS NULL AND i.deleted_at IS NULL
             AND s.created_at >= now() - make_interval(days => ?::integer) GROUP BY i.medicine_id
         )
         SELECT m.name AS medicine, stock.available_units, GREATEST(0, COALESCE(movement.units_sold,0)) AS units_sold
         FROM stock JOIN medicines m ON m.id=stock.medicine_id LEFT JOIN movement ON movement.medicine_id=m.id
         WHERE stock.available_units>0 AND m.deleted_at IS NULL
           AND ${kind === 'dead-stock' ? 'COALESCE(movement.units_sold,0)<=0' : 'movement.units_sold BETWEEN 1 AND 10'}
         ORDER BY units_sold, m.name`, [clinicId, storeId, storeId, clinicId, storeId, storeId, days],
      );
    case 'employee-sales':
      return queryRaw(
        `SELECT COALESCE(u.full_name, 'Unassigned') AS employee,
           COUNT(*) FILTER (WHERE NOT COALESCE(s.is_return,false))::int AS invoices,
           COUNT(*) FILTER (WHERE s.is_return)::int AS reversals,
           SUM(CASE WHEN s.is_return THEN -ABS(s.net_amount) ELSE s.net_amount END) AS net_sales
         FROM sales s LEFT JOIN users u ON u.id=s.served_by AND u.clinic_id=s.clinic_id
         WHERE s.clinic_id=? AND (?::uuid IS NULL OR s.store_id=?::uuid) AND s.deleted_at IS NULL
           AND ${from.replace('event_date', 's.created_at')} AND ${to.replace('event_date', 's.created_at')}
         GROUP BY u.id,u.full_name ORDER BY net_sales DESC`, [clinicId, storeId, storeId, ...dateArgs],
      );
    case 'customer-outstanding':
    case 'supplier-outstanding':
      return queryRaw(
        `SELECT name AS party, phone, outstanding_balance AS outstanding
         FROM ${kind === 'customer-outstanding' ? 'customers' : 'suppliers'}
         WHERE clinic_id = ? AND deleted_at IS NULL AND outstanding_balance <> 0 ORDER BY outstanding_balance DESC, name`,
        [clinicId],
      );
    case 'valuation':
      return queryRaw(
        `SELECT COALESCE(st.name,'Unassigned') AS store, SUM(b.quantity_remaining) AS units,
           ROUND(SUM(b.quantity_remaining * b.purchase_price),2) AS cost_value,
           ROUND(SUM(b.quantity_remaining * b.mrp),2) AS mrp_value
         FROM medicine_batches b LEFT JOIN stores st ON st.id=b.store_id
         WHERE ${scopedBatch} AND b.deleted_at IS NULL AND NOT b.is_disposed
         GROUP BY st.id, st.name ORDER BY store`, [clinicId, storeId, storeId],
      );
    case 'stock-movement':
      return queryRaw(
        `SELECT l.created_at AS date, COALESCE(st.name,'Unassigned') AS store, m.name AS medicine, b.batch_number,
           l.movement_type, l.quantity_delta, l.balance_after, l.reference_id, l.notes
         FROM stock_ledger l LEFT JOIN medicines m ON m.id=l.medicine_id LEFT JOIN medicine_batches b ON b.id=l.batch_id
         LEFT JOIN stores st ON st.id=l.store_id
         WHERE l.clinic_id=? AND (?::uuid IS NULL OR l.store_id=?::uuid) AND l.deleted_at IS NULL
           AND ${from.replace('event_date', 'l.created_at')} AND ${to.replace('event_date', 'l.created_at')}
         ORDER BY l.created_at DESC,l.id`, [clinicId, storeId, storeId, ...dateArgs],
      );
    case 'returns':
      return queryRaw(
        `SELECT r.created_at AS date, r.invoice_number AS reversal, s.invoice_number AS original_invoice,
           CASE WHEN v.reversal_id IS NULL THEN 'RETURN' ELSE 'CANCELLATION' END AS kind,
           ABS(r.net_amount) AS total, n.external_refund_paise/100.0 AS refunded, COALESCE(v.reason,n.reason) AS reason
         FROM sales r JOIN sales s ON s.id=r.return_of AND s.clinic_id=r.clinic_id
         LEFT JOIN sale_return_credit_notes n ON n.return_sale_id=r.id LEFT JOIN sale_voids v ON v.reversal_id=r.id
         WHERE r.clinic_id=? AND r.is_return AND r.deleted_at IS NULL AND (?::uuid IS NULL OR r.store_id=?::uuid)
           AND ${from.replace('event_date', 'r.created_at')} AND ${to.replace('event_date', 'r.created_at')}
         ORDER BY r.created_at DESC, r.id`, [clinicId, storeId, storeId, ...dateArgs],
      );
    case 'party-ledger':
      return queryRaw(
        `WITH ledger AS (
           SELECT c.name AS party, 'CUSTOMER' AS party_type, s.created_at AS event_date, s.invoice_number AS reference,
             CASE WHEN s.is_return THEN 'RETURN' ELSE 'INVOICE' END AS event,
             CASE WHEN s.is_return THEN -ABS(s.net_amount) ELSE s.net_amount END AS amount
           FROM sales s JOIN customers c ON c.id=s.customer_id AND c.clinic_id=s.clinic_id
           WHERE s.clinic_id=? AND s.deleted_at IS NULL
           UNION ALL
           SELECT c.name,'CUSTOMER',a.created_at,a.record_id::text,'PAYMENT',
             -ABS(COALESCE((a.new_data->>'amount')::numeric, 0))
           FROM audit_logs a JOIN customers c ON c.id::text=a.record_id::text AND c.clinic_id=a.clinic_id
           WHERE a.clinic_id=? AND a.table_name='customers' AND a.action='PAYMENT_RECEIVED'
           UNION ALL
           SELECT v.name,'SUPPLIER',l.created_at,l.reference_number,l.transaction_type,(l.credit_paise-l.debit_paise)/100.0
           FROM supplier_payable_ledger l JOIN suppliers v ON v.id=l.supplier_id
           WHERE v.clinic_id=? AND l.deleted_at IS NULL
         )
         SELECT party,party_type,event_date AS date,reference,event,amount FROM ledger
         WHERE ${from} AND ${to} ORDER BY event_date DESC,party`, [clinicId, clinicId, clinicId, ...dateArgs],
      );
  }
}

export function csvForRows(rows: Record<string, unknown>[], columns: string[]) {
  const escape = (value: unknown) => {
    const raw = value instanceof Date ? value.toISOString() : String(value ?? '');
    const text = typeof value === 'string' && /^[\t\r\n ]*[=+@-]/.test(raw) && !/^-?\d+(\.\d+)?$/.test(raw) ? "'" + raw : raw;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [columns.map(escape).join(','), ...rows.map(row => columns.map(key => escape(row[key])).join(','))].join('\r\n') + '\r\n';
}
