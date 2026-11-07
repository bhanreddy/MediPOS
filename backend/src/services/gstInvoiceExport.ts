import { Money } from '../lib/money';
import { queryRaw } from '../lib/postgresDb';
import { AppError } from '../lib/appError';
import { apportionPaise } from './cloudSaleReturns';

const date = (value: string | Date) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date(value)).replaceAll('/', '-');

interface TaxLine {
  txval: number;
  camt: number;
  samt: number;
  iamt: number;
}

function addTax(target: TaxLine, source: TaxLine, sign = 1) {
  target.txval = Money.add(target.txval, sign * source.txval);
  target.camt = Money.add(target.camt, sign * source.camt);
  target.samt = Money.add(target.samt, sign * source.samt);
  target.iamt = Money.add(target.iamt, sign * source.iamt);
}
const zero = () => ({ txval: 0, camt: 0, samt: 0, iamt: 0 });
function fromSnapshot(line: Record<string, number>): TaxLine {
  return {
    txval: Money.toRupees(line.taxable_paise), camt: Money.toRupees(line.cgst_paise),
    samt: Money.toRupees(line.sgst_paise), iamt: Money.toRupees(line.igst_paise),
  };
}

export async function gstInvoiceExport(clinicId: string, storeId: string | null, month: number, year: number) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const [issuer] = await queryRaw(
    `SELECT COALESCE(NULLIF(s.gstin_override,''),NULLIF(c.gstin,''),o.gstin) AS gstin
     FROM clinics c LEFT JOIN stores s ON s.clinic_id=c.id AND s.id=?::uuid
     LEFT JOIN organizations o ON o.id=c.organization_id WHERE c.id=?`, [storeId, clinicId],
  );
  const gstin = String(issuer?.gstin ?? '').trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstin)) {
    throw new AppError(409, 'Configure the store or clinic GSTIN before preparing GSTR-1.');
  }
  const records = await queryRaw(
    `SELECT s.id, s.invoice_number, s.created_at, s.net_amount, s.gst_amount, s.price_includes_tax, s.is_return,
       s.invoice_snapshot, original.net_amount AS original_net_amount,
       CASE WHEN s.invoice_snapshot IS NULL THEN c.gstin ELSE s.invoice_snapshot->'buyer'->>'gstin' END AS buyer_gstin,
       i.id AS item_id, i.quantity, i.total, i.gst_rate, i.invoice_line_snapshot, m.name AS medicine_name, m.hsn_code
     FROM sales s JOIN sale_items i ON i.sale_id=s.id AND i.clinic_id=s.clinic_id AND i.deleted_at IS NULL
     LEFT JOIN sales original ON original.id=s.return_of AND original.clinic_id=s.clinic_id
     LEFT JOIN customers c ON c.id=s.customer_id AND c.clinic_id=s.clinic_id
     LEFT JOIN medicines m ON m.id=i.medicine_id AND m.clinic_id=s.clinic_id
     WHERE s.clinic_id=? AND (?::uuid IS NULL OR s.store_id=?::uuid) AND s.deleted_at IS NULL
       AND s.created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')
       AND s.created_at < (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')
     ORDER BY s.created_at,s.id,i.id`, [clinicId, storeId, storeId, first, next],
  );

  const warnings = new Set<string>();
  const b2b = new Map<string, object[]>();
  const b2cl = new Map<string, object[]>();
  const b2cs = new Map<string, TaxLine & { sply_ty: string; pos: string; rt: number; typ: string }>();
  const cdnr = new Map<string, object[]>();
  const cdnur: object[] = [];
  const nil = new Map<string, { sply_ty: string; nil_amt: number; expt_amt: number; ngsup_amt: number }>();
  type HsnRow = TaxLine & { hsn_sc: string; desc: string; uqc: string; rt: number; qty: number; val: number };
  const hsnB2b = new Map<string, HsnRow>();
  const hsnB2c = new Map<string, HsnRow>();
  const documents = { invoices: [] as string[], notes: [] as string[] };
  const grouped = new Map<string, typeof records>();
  for (const row of records) {
    const saleGstin = row.invoice_snapshot?.seller?.gstin;
    if (saleGstin && saleGstin !== gstin) continue;
    if (!grouped.has(row.id)) grouped.set(row.id, []);
    grouped.get(row.id)!.push(row);
  }

  for (const rows of grouped.values()) {
    const sale = rows[0];
    const snapshot = sale.invoice_snapshot;
    const party = typeof sale.buyer_gstin === 'string' && sale.buyer_gstin.length === 15 ? sale.buyer_gstin.toUpperCase() : null;
    const pos = snapshot?.place_of_supply ?? gstin.slice(0, 2);
    const interstate = !!snapshot?.is_interstate;
    const sign = sale.is_return ? -1 : 1;
    const total = Math.abs(Number(sale.net_amount));
    const threshold = (year > 2024 || (year === 2024 && month >= 8)) ? 100000 : 250000;
    const large = interstate && !party && Math.abs(Number(sale.original_net_amount ?? total)) > threshold;
    const buckets = new Map<number, TaxLine>();
    const unclassified = rows.some(row => !row.invoice_line_snapshot);
    const fallbackGross = apportionPaise(Money.toPaise(total), rows.map(row => ({ id: row.item_id, weight: Math.abs(Money.toPaise(row.total)) })));
    const fallbackTax = apportionPaise(Math.abs(Money.toPaise(sale.gst_amount || 0)), rows.map(row => ({
      id: row.item_id, weight: Math.abs(Money.toPaise(row.total * Number(row.gst_rate) / (100 + Number(row.gst_rate)))),
    })));
    if (!snapshot || unclassified) warnings.add('Some historical bills used current catalog codes and an allocation of their recorded invoice tax. Reconcile those invoices before filing.');
    if (sale.invoice_number.length > 16) warnings.add('Some historical invoice numbers exceed 16 characters. Review the original records before import.');
    (sale.is_return ? documents.notes : documents.invoices).push(sale.invoice_number);

    for (const line of rows) {
      const rate = Number(line.gst_rate);
      const fallbackAmount = fallbackGross.get(line.item_id) ?? 0;
      const legacyTax = fallbackTax.get(line.item_id) ?? 0;
      const central = Math.ceil(legacyTax / 2);
      const tax = line.invoice_line_snapshot ? fromSnapshot(line.invoice_line_snapshot) : fromSnapshot({
        taxable_paise: Math.max(0, fallbackAmount - legacyTax), cgst_paise: central,
        sgst_paise: legacyTax - central, igst_paise: 0,
      });
      const gross = line.invoice_line_snapshot ? Money.toRupees(line.invoice_line_snapshot.gross_paise) : Money.toRupees(fallbackAmount);
      const hsn = line.invoice_line_snapshot?.hsn_code ?? line.hsn_code;
      if (!hsn || !/^\d{4,8}$/.test(hsn)) warnings.add('Some invoices are missing a usable HSN code.');
      else {
        const summaries = party ? hsnB2b : hsnB2c;
        const key = `${hsn}:${rate}`;
        const summary = summaries.get(key) ?? { ...zero(), hsn_sc: hsn, desc: line.invoice_line_snapshot?.product_name ?? line.medicine_name ?? '',
          uqc: 'NOS', rt: rate, qty: 0, val: 0 };
        addTax(summary, tax, sign);
        summary.qty += sign * Number(line.quantity);
        summary.val = Money.add(summary.val, sign * gross);
        summaries.set(key, summary);
      }
      if (rate === 0) {
        warnings.add('Zero-rate goods are shown under nil-rated supplies for preparation. Confirm whether each is nil-rated, exempt, or non-GST before filing.');
        const sply_ty = `${interstate ? 'INTER' : 'INTRA'}${party ? 'B2B' : 'B2C'}`;
        const bucket = nil.get(sply_ty) ?? { sply_ty, nil_amt: 0, expt_amt: 0, ngsup_amt: 0 };
        bucket.nil_amt = Money.add(bucket.nil_amt, sign * gross);
        nil.set(sply_ty, bucket);
        continue;
      }
      const bucket = buckets.get(rate) ?? zero();
      addTax(bucket, tax);
      buckets.set(rate, bucket);
    }
    if (!buckets.size) continue;
    const itms = [...buckets.entries()].map(([rt, values], index) => ({ num: index + 1, itm_det: { rt, ...values, csamt: 0 } }));
    if (sale.is_return && party) {
      const notes = cdnr.get(party) ?? [];
      notes.push({ ntty: 'C', nt_num: sale.invoice_number, nt_dt: date(sale.created_at), val: total, pos, rchrg: 'N', inv_typ: 'R', itms });
      cdnr.set(party, notes);
    } else if (sale.is_return && large) {
      cdnur.push({ typ: 'B2CL', ntty: 'C', nt_num: sale.invoice_number, nt_dt: date(sale.created_at), val: total, pos, itms });
    } else if (party || large) {
      const map = party ? b2b : b2cl;
      const key = party ?? pos;
      const invoices = map.get(key) ?? [];
      invoices.push({ inum: sale.invoice_number, idt: date(sale.created_at), val: total, pos, inv_typ: 'R', rchrg: 'N', itms });
      map.set(key, invoices);
    } else {
      for (const [rt, values] of buckets) {
        const key = `${pos}:${rt}`;
        const summary = b2cs.get(key) ?? { ...zero(), sply_ty: interstate ? 'INTER' : 'INTRA', pos, rt, typ: 'OE' };
        addTax(summary, values, sign);
        b2cs.set(key, summary);
      }
    }
  }
  const hsnRows = (rows: Map<string, HsnRow>) => [...rows.values()].map((row, index) => ({ num: index + 1, ...row }));
  const documentDetails = Object.entries(documents).filter(([, numbers]) => numbers.length).map(([series, numbers]) => ({
    doc_num: series === 'invoices' ? 1 : 5,
    docs: [{ num: 1, from: numbers[0], to: numbers[numbers.length - 1], totnum: numbers.length, cancel: 0, net_issue: numbers.length }],
  }));
  return {
    data: { gstin, fp: `${String(month).padStart(2, '0')}${year}`,
      b2b: [...b2b].map(([ctin, inv]) => ({ ctin, inv })),
      b2cl: [...b2cl].map(([pos, inv]) => ({ pos, inv })), b2cs: [...b2cs.values()],
      cdnr: [...cdnr].map(([ctin, nt]) => ({ ctin, nt })), cdnur,
      nil: { inv: [...nil.values()] },
      hsn: { hsn_b2b: hsnRows(hsnB2b), hsn_b2c: hsnRows(hsnB2c) }, doc_issue: { doc_det: documentDetails },
    },
    warnings: [...warnings],
  };
}
