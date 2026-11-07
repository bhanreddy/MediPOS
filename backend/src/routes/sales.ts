import { resolveInvoiceIdentity, snapshotCreditLine, snapshotInvoiceLines, taxDocumentNumber } from '../services/invoiceSnapshot';
import { recordRegulatedDispensing, verifyRegulatedDispensing } from '../services/regulatedDispensing';
import { z } from 'zod';
import { enforceDiscount, recordCounterAudit } from '../services/counterDiscounts';
import { ParkedSalesService } from '../services/parkedSales';
import { allocateRefundTenders, calculateTenderPlan, postTenderEntries, salePayments } from '../services/saleTenders';
import { quoteCloudSaleReturn } from '../services/cloudSaleReturns';
import { randomUUID } from 'node:crypto';
import { allocateCloudSale, listCloudSaleBatches } from '../services/cloudSaleAllocation';
const escapeInvoiceHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
import { createHash } from "node:crypto";
import { getCoinPolicy } from "../services/wallet/coinPolicy";
import { WalletService } from "../services/wallet/walletService";
import { assertSaleStore, resolveCloudStoreContext, selectedCloudStore, visibleCloudStoreIds } from "../services/cloudStoreContext";
import { transactionalRoute } from "../lib/transactionalRoute";
import {
  afterPostgresCommit,
  localMutate,
  localInsertMany,
  queryAll,
  queryOne,
  queryRaw,
  queryCount,
} from "../lib/postgresDb";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { createSaleSchema, saleReturnSchema } from "../schemas/sale.schema";
import { AppError } from "../lib/appError";
import { enforcePlan } from "../middleware/planEnforcement";
import { Money } from "../lib/money";
import { DailySalesSummaryService } from "../services/dailySalesSummary";
import { InventoryPositionService } from "../services/inventoryPosition";
import { loadSaleReferences } from "../services/saleReferences";

export const salesRouter = Router();

// GET /api/sales
salesRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(
      1,
      Math.min(parseInt(req.query.limit as string) || 20, 100),
    );
    const customer_id = req.query.customer_id as string;
    const medicine_id = req.query.medicine_id as string;
    const store_id = (req.query.store_id as string) || selectedCloudStore();
    const from = req.query.from as string;
    const to = req.query.to as string;
    const payment_status = req.query.payment_status as string;
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const clinicId = req.user!.clinic_id!;
    const conditions: string[] = ["clinic_id=?"];
    const values: any[] = [clinicId];

    if (store_id) {
      await assertSaleStore(clinicId, store_id);
      conditions.push("store_id=?");
      values.push(store_id);
    } else {
      const storeIds = await visibleCloudStoreIds(clinicId);
      if (storeIds) {
        conditions.push('store_id = ANY(?::uuid[])');
        values.push(storeIds);
      }
    }
    if (medicine_id) {
      const med = await queryOne(
        "medicines",
        "(_local_id=? OR id=?) AND clinic_id=?",
        [medicine_id, medicine_id, clinicId],
      );
      const resolvedMedicineId = med ? (med as any).id : medicine_id;
      conditions.push(
        "id IN (SELECT sale_id FROM sale_items WHERE _deleted=0 AND medicine_id=?)",
      );
      values.push(resolvedMedicineId);
    }
    if (customer_id) {
      conditions.push(`(customer_id=? OR (is_return=true AND EXISTS (
        SELECT 1 FROM sales original WHERE original.id=sales.return_of
          AND original.customer_id=? AND original.clinic_id=sales.clinic_id AND original._deleted=0
      )))`);
      values.push(customer_id, customer_id);
    }
    if (payment_status) {
      conditions.push("payment_status=?");
      values.push(payment_status);
    }
    if (from) {
      conditions.push("created_at>=?");
      values.push(from);
    }
    if (to) {
      conditions.push("created_at<=?");
      values.push(to);
    }

    if (search) {
      conditions.push(`(invoice_number ILIKE ? OR payment_mode ILIKE ? OR EXISTS (
        SELECT 1 FROM customers c WHERE c.clinic_id = sales.clinic_id AND c._deleted = 0
          AND (c.id = sales.customer_id OR c._local_id = sales.customer_id::text) AND c.name ILIKE ?
      ))`);
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      values.push(pattern, pattern, pattern);
    }

    const where = conditions.length > 0 ? conditions.join(" AND ") : "";
    const offset = (page - 1) * limit;

    let queryStr = `SELECT sales.*,
      (SELECT created_at FROM sale_voids WHERE sale_id = sales.id AND clinic_id = sales.clinic_id) AS voided_at
      FROM sales WHERE _deleted = 0`;
    if (where) {
      queryStr += ` AND (${where})`;
    }
    queryStr += ` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;

    const [total, data] = await Promise.all([
      queryCount("sales", where, values),
      queryRaw(queryStr, [...values, limit, offset]),
    ]);

    // Older returns did not store customer_id. The filter above verifies their original bill.
    if (customer_id) {
      for (const sale of data) {
        if (sale.is_return && !sale.customer_id && sale.return_of) sale.customer_id = customer_id;
      }
    }

    // Attach customer name (in batch)
    const customerIds = [
      ...new Set(data.map((sale: any) => sale.customer_id).filter(Boolean)),
    ];
    if (customerIds.length > 0) {
      const placeholders = customerIds.map(() => "?").join(",");
      const customers = await queryRaw(
        `SELECT id, _local_id, name FROM customers WHERE (_local_id IN (${placeholders}) OR id IN (${placeholders})) AND clinic_id = ? AND _deleted = 0`,
        [...customerIds, ...customerIds, clinicId],
      );
      const customerMap = new Map();
      for (const cust of customers) {
        customerMap.set(cust.id, cust);
        customerMap.set(cust._local_id, cust);
      }
      for (const sale of data) {
        if (sale.customer_id) {
          const cust = customerMap.get(sale.customer_id);
          sale.customers = { name: cust?.name ?? "" };
        } else {
          sale.customers = { name: "" };
        }
      }
    } else {
      for (const sale of data) {
        sale.customers = { name: "" };
      }
    }

    res.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales/:id
salesRouter.get("/:id", requireAuth, async (req, res, next) => {
  if (req.params.id === "returns") return next();
  try {
    const clinicId = req.user!.clinic_id!;
    const sale = await queryOne(
      "sales",
      "(_local_id=? OR id=?) AND clinic_id=?",
      [req.params.id, req.params.id, clinicId],
    );
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    await assertSaleStore(clinicId, sale.store_id);

    if ((sale as any).is_return && !(sale as any).customer_id && (sale as any).return_of) {
      const original = await queryOne("sales", "id=? AND clinic_id=?", [(sale as any).return_of, clinicId]);
      if (original) (sale as any).customer_id = (original as any).customer_id;
    }
    const saleId = (sale as any).id;
    const saleItems = await queryAll("sale_items", "sale_id=?", [saleId]);

    // Attach medicine names and batch numbers (in batch)
    const medicineIds = saleItems
      .map((item: any) => item.medicine_id)
      .filter(Boolean);
    const batchIds = saleItems
      .map((item: any) => item.batch_id)
      .filter(Boolean);

    let medicineMap = new Map();
    if (medicineIds.length > 0) {
      const placeholders = medicineIds.map(() => "?").join(",");
      const medicines = await queryRaw(
        `SELECT id, _local_id, name FROM medicines WHERE (_local_id IN (${placeholders}) OR id IN (${placeholders})) AND clinic_id=?`,
        [...medicineIds, ...medicineIds, clinicId],
      );
      for (const med of medicines) {
        medicineMap.set(med.id, med);
        medicineMap.set(med._local_id, med);
      }
    }

    let batchMap = new Map();
    if (batchIds.length > 0) {
      const placeholders = batchIds.map(() => "?").join(",");
      const batches = await queryRaw(
        `SELECT id, _local_id, batch_number, expiry_date FROM medicine_batches WHERE (_local_id IN (${placeholders}) OR id IN (${placeholders})) AND clinic_id=?`,
        [...batchIds, ...batchIds, clinicId],
      );
      for (const b of batches) {
        batchMap.set(b.id, b);
        batchMap.set(b._local_id, b);
      }
    }

    for (const item of saleItems) {
      if (item.medicine_id) {
        const med = medicineMap.get(item.medicine_id);
        item.medicines = { name: med?.name ?? "" };
      } else {
        item.medicines = { name: "" };
      }
      if (item.batch_id) {
        const batch = batchMap.get(item.batch_id);
        item.medicine_batches = {
          batch_number: batch?.batch_number ?? "",
          expiry_date: batch?.expiry_date ?? "",
        };
      } else {
        item.medicine_batches = { batch_number: "", expiry_date: "" };
      }
    }

    const [voidRecord] = await queryRaw(
      'SELECT * FROM sale_voids WHERE (sale_id=? OR reversal_id=?) AND clinic_id=?', [saleId, saleId, clinicId],
    );
    const audit = await queryRaw(
      'SELECT action, actor_id, details, created_at FROM counter_sale_audit WHERE sale_id=? AND clinic_id=? ORDER BY created_at',
      [saleId, clinicId],
    );
    const [clinical] = await queryRaw(
      `SELECT prescription_id, evidence->>'pharmacist_name' AS pharmacist_name,
              evidence->>'pharmacist_registration' AS pharmacist_registration
       FROM regulated_dispensing WHERE sale_id=? AND clinic_id=?`, [saleId, clinicId],
    );
    res.json({ data: { ...sale, sale_items: saleItems, dispensing: clinical, void_record: voidRecord, counter_audit: audit,
      payment_transactions: await salePayments(saleId, clinicId) } });
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/medicine/:id/batches', requireAuth, requireRole('CASHIER', 'PHARMACIST', 'OWNER'), transactionalRoute(async (req, res) => {
  const clinicId = req.user!.clinic_id!;
  const requestedStore = typeof req.query.store_id === 'string' ? req.query.store_id : undefined;
  const { storeId } = await resolveCloudStoreContext(clinicId, { store_id: requestedStore });
  res.json({ data: await listCloudSaleBatches(req.params.id, clinicId, storeId) });
}));

// A quote is recalculated against locked PostgreSQL stock and canonical batch prices.
salesRouter.post('/quote',requireAuth,requireRole('CASHIER','PHARMACIST','OWNER'),transactionalRoute(async(req,res,next)=>{
 try {
  const parsed=createSaleSchema.parse(req.body),clinicId=req.user!.clinic_id!;
  const {storeId,organizationId}=await resolveCloudStoreContext(clinicId,parsed);
  const actor = req.user!;
  const reviewRestricted = actor.role === 'PHARMACIST' && !!parsed.prescription_id;
  const items=await allocateCloudSale(parsed.items,clinicId,storeId,true,reviewRestricted);
  if (reviewRestricted) await verifyRegulatedDispensing({
    clinicId, storeId, organizationId, actorId: actor.id, role: actor.role, customerId: parsed.customer_id,
  }, parsed, items);
  const identity = await resolveInvoiceIdentity({
    clinicId, storeId, customerId: parsed.customer_id,
    placeOfSupply: parsed.place_of_supply_state_code, deliveryAddress: parsed.delivery_address,
  });
  const calculation=Money.calculateGrandTotal({items:items.map(item=>({quantity:item.quantity,unitPrice:item.mrp,discountPct:item.discount_pct,gstRate:item.gst_rate})),billDiscount:parsed.discount,isBillDiscountPercentage:parsed.is_bill_discount_percentage,priceIncludesTax:true,isInterstate:identity.is_interstate});
  res.json({data:{...calculation,items,expected_total_paise:Money.toPaise(calculation.grandTotal)}});
 }catch(error){next(error);}
}));

// POST /api/sales
export const createSaleHandler = transactionalRoute(async (req, res, next) => {
    try {
      const parsed = createSaleSchema.parse({
        ...req.body, _local_id: req.body?._local_id || req.get('Idempotency-Key'),
      });
      if (parsed.payments && !parsed._local_id) {
        throw new AppError(428, 'Split payment needs a checkout request identifier.', 'IDEMPOTENCY_KEY_REQUIRED');
      }
      const collectedPaise = parsed.payments
        ? parsed.payments.filter(payment => payment.tender_type !== 'CREDIT')
          .reduce((sum, payment) => sum + payment.amount_paise, 0)
        : Money.toPaise(parsed.paid_amount);
      const clinicId = req.user!.clinic_id!;

      const walletAmount = parsed.wallet_amount_paise;
      const checkoutHash = createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
      if (walletAmount > 0 && (!parsed.customer_id || !parsed._local_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed._local_id) || (parsed.payment_mode === 'credit' || parsed.payments?.some(payment => payment.tender_type === 'CREDIT'))))
        throw new AppError(400, 'Wallet checkout requires a saved customer, a request identifier and full payment');
      if (walletAmount === 0 && parsed.payment_mode === 'wallet') throw new AppError(400,'No promotional credits were specified');
      if (parsed._local_id) {
        await queryRaw('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', [`sale:${clinicId}:${parsed._local_id}`]);
        const existing = await queryOne('sales', '_local_id=? AND clinic_id=?', [parsed._local_id,clinicId]);
        if (existing) {
          await resolveCloudStoreContext(clinicId,{store_id:existing.store_id});
          if (existing.wallet_checkout_hash !== checkoutHash) throw new AppError(409, 'This checkout identifier was already used for a different bill');
          const items = await queryAll('sale_items','sale_id=? AND clinic_id=?',[existing.id,clinicId]);
          return void res.json({data:{...existing,sale_items:items,payment_transactions:await salePayments(existing.id, clinicId)}});
        }
      }

      const { organizationId, storeId, counterId, terminalId } =
        await resolveCloudStoreContext(clinicId, parsed);

      if (parsed.park_id) {
        if (!storeId) throw new AppError(409, 'Choose a store to resume this bill.');
        await ParkedSalesService.requireClaim(parsed.park_id, storeId, req.user!.id);
      }
      const reviewRestricted = req.user!.role === 'PHARMACIST' && !!parsed.prescription_id;
      parsed.items = await allocateCloudSale(parsed.items, clinicId, storeId, parsed.expected_total_paise!==undefined, reviewRestricted);

      // Stock Validation & ID Resolution Map
      const references = await loadSaleReferences(parsed.items as Array<typeof parsed.items[number] & {batch_id:string}>, clinicId);
      const resolvedIdsMap = new Map<
        string,
        {
          resolvedMedicineId: string;
          resolvedBatchId: string;
          batchLocalId: string;
          currentStock: number;
        }
      >();
      const reservedQuantities = new Map<string, number>();
      for (const item of parsed.items) {
        const batch = references.batches.get(item.batch_id!);
        if (!batch)
          throw new AppError(
            404,
            `Batch not found: ${item.batch_id}`,
            "BATCH_NOT_FOUND",
          );
        if (
          (batch as any).is_disposed === true ||
          (batch as any).is_disposed === 1
        ) {
          throw new AppError(
            400,
            `Batch is disposed and cannot be sold: ${item.batch_id}`,
            "BATCH_DISPOSED",
          );
        }

        // Expired batch check
        const expiry = (batch as any).expiry_date
          ? new Date((batch as any).expiry_date).toISOString().split("T")[0]
          : "";
        const today = new Date().toISOString().split("T")[0];
        if (expiry && expiry < today) {
          throw new AppError(
            400,
            `Batch ${(batch as any).batch_number || item.batch_id} is expired (${expiry}) and cannot be sold.`,
            "EXPIRED_BATCH",
          );
        }

        const med = references.medicines.get(item.medicine_id);
        if (!med)
          throw new AppError(
            404,
            `Medicine not found: ${item.medicine_id}`,
            "MEDICINE_NOT_FOUND",
          );

        if (batch.medicine_id !== med.id && batch.medicine_id !== med._local_id)
          throw new AppError(
            400,
            "Selected batch does not belong to the selected medicine",
            "BATCH_MEDICINE_MISMATCH",
          );
        const stockRemaining = Number((batch as any).quantity_remaining ?? 0);
        const batchKey = String(batch.id || batch._local_id);
        const requestedQuantity =
          (reservedQuantities.get(batchKey) || 0) + item.quantity;
        reservedQuantities.set(batchKey, requestedQuantity);
        if (stockRemaining < requestedQuantity) {
          throw new AppError(
            409,
            `Insufficient stock for ${(med as any).name}. Available: ${stockRemaining}, Requested: ${item.quantity}`,
            "INSUFFICIENT_STOCK",
          );
        }

        resolvedIdsMap.set(`${item.medicine_id}:${item.batch_id}`, {
          resolvedMedicineId: (med as any).id,
          resolvedBatchId: (batch as any).id,
          batchLocalId: (batch as any)._local_id || (batch as any).id,
          currentStock: stockRemaining,
        });
      }

      const identity = await resolveInvoiceIdentity({
        clinicId, storeId, customerId: parsed.customer_id,
        placeOfSupply: parsed.place_of_supply_state_code, deliveryAddress: parsed.delivery_address,
      });

      // Money Calculations using Canonical Engine
      const calculatedItems = parsed.items.map((item) => {
        const lineCalc = Money.calculateLineItem({
          quantity: item.quantity,
          unitPrice: item.mrp,
          discountPct: item.discount_pct,
          gstRate: item.gst_rate,
          isInterstate: identity.is_interstate,
          priceIncludesTax: parsed.price_includes_tax,
        });
        const resolved = resolvedIdsMap.get(
          `${item.medicine_id}:${item.batch_id}`,
        )!;
        return {
          item,
          lineCalc,
          resolved,
        };
      });

      const grandCalc = Money.calculateGrandTotal({
        items: parsed.items.map((i) => ({
          quantity: i.quantity,
          unitPrice: i.mrp,
          discountPct: i.discount_pct,
          gstRate: i.gst_rate,
        })),
        billDiscount: parsed.discount,
        isBillDiscountPercentage: parsed.is_bill_discount_percentage,
        paidAmount: Money.toRupees(collectedPaise + walletAmount),
        priceIncludesTax: parsed.price_includes_tax,
        isInterstate: identity.is_interstate,
      });

      if(parsed.expected_total_paise!==undefined&&parsed.expected_total_paise!==Money.toPaise(grandCalc.grandTotal)) throw new AppError(409,'Stock allocation or prices changed. Refresh the bill before confirming.','CHECKOUT_QUOTE_CHANGED');
      const counterScope = { clinicId, storeId, userId: req.user!.id, role: req.user!.role };
      const discountDecision = await enforceDiscount(counterScope, { ...parsed, ...grandCalc }, {
        checkoutId: parsed._local_id, approvalId: parsed.discount_approval_id,
        reason: parsed.discount_reason, reasonRequired: parsed.register_required,
      });

      // Resolve customer_id
      let customerId = null;
      let customerObj: any = null;
      if (parsed.customer_id) {
        const cust = await queryOne(
          "customers",
          "(_local_id=? OR id=?) AND clinic_id=?",
          [parsed.customer_id, parsed.customer_id, clinicId],
        );
        if (cust) {
          customerId = (cust as any).id;
          customerObj = cust;
        }
      }

      if(grandCalc.balanceDue>0&&!customerObj)throw new AppError(400,'Select a saved customer for a credit sale','CUSTOMER_REQUIRED');
      if (parsed.customer_id && !customerObj) throw new AppError(404,'Customer not found in this medical store');
      const dispensingScope = {
        clinicId, storeId, organizationId, actorId: req.user!.id, role: req.user!.role, customerId,
      };
      const dispensing = reviewRestricted ? await verifyRegulatedDispensing(dispensingScope, parsed, parsed.items) : null;
      const coinPolicy = customerId ? await getCoinPolicy(clinicId) : null;
      if (walletAmount > 0 && coinPolicy && walletAmount > Math.floor(Money.toPaise(grandCalc.grandTotal) * coinPolicy.redemption_limit_percent / 100))
        throw new AppError(409,`Nex Coins can cover at most ${coinPolicy.redemption_limit_percent}% of this bill`);

      if (walletAmount > 0 && (!customerObj || walletAmount > Money.toPaise(grandCalc.grandTotal) || grandCalc.balanceDue > 0 || collectedPaise + walletAmount > Money.toPaise(grandCalc.grandTotal)))
        throw new AppError(400, 'Wallet credits and collected payment must exactly cover this bill');

      if (
        grandCalc.balanceDue > 0 && customerObj &&
        Number(customerObj.credit_limit) > 0 &&
        Number(customerObj.outstanding_balance || 0) + grandCalc.balanceDue >
          Number(customerObj.credit_limit)
      )
        throw new AppError(
          409,
          "Customer credit limit would be exceeded",
          "CREDIT_LIMIT_EXCEEDED",
        );

      const tenders = calculateTenderPlan({
        totalPaise: Money.toPaise(grandCalc.grandTotal),
        paidPaise: Money.toPaise(grandCalc.paidAmount),
        balancePaise: Money.toPaise(grandCalc.balanceDue),
        walletPaise: walletAmount,
        paymentMode: parsed.payment_mode,
        payments: parsed.payments,
      });
      const paymentMode = parsed.payments
        ? (tenders.length > 1 || !['CASH', 'UPI', 'CARD', 'CREDIT'].includes(tenders[0]?.tender_type)
          ? 'mixed' : tenders[0].tender_type.toLowerCase())
        : walletAmount > 0 && walletAmount === Money.toPaise(grandCalc.grandTotal) ? 'wallet' : parsed.payment_mode;

      if (identity.seller.gstin && !identity.buyer?.gstin && grandCalc.taxableSubtotal >= 50000
        && (!identity.buyer?.address?.trim() || !identity.delivery_address || !identity.place_of_supply)) {
        throw new AppError(400, 'Add the recipient name, address, delivery address and State for this tax invoice.');
      }
      const invoiceLines = snapshotInvoiceLines(calculatedItems.map(({ item, lineCalc }) => {
        const medicine = references.medicines.get(item.medicine_id);
        const batch = references.batches.get(item.batch_id!);
        return {
          grossPaise: Money.toPaise(lineCalc.total), taxPaise: Money.toPaise(lineCalc.gstAmount),
          name: medicine?.name ?? '', manufacturer: medicine?.manufacturer ?? null, hsn: medicine?.hsn_code ?? null,
          batch: batch?.batch_number ?? '', expiry: batch?.expiry_date ?? null, unit: medicine?.base_unit ?? 'NOS', unitCostPaise: Money.toPaise(batch?.purchase_price || 0),
        };
      }), grandCalc);
      const invoiceSnapshot = {
        ...identity, taxable_paise: Money.toPaise(grandCalc.taxableSubtotal),
        cgst_paise: Money.toPaise(grandCalc.totalCgst), sgst_paise: Money.toPaise(grandCalc.totalSgst),
        igst_paise: Money.toPaise(grandCalc.totalIgst),
        ...(dispensing ? { pharmacist: {
          name: dispensing.registration.full_name, registration: dispensing.registration.registration_number,
        }, prescriber: { name: dispensing.rx.doctor_name_snapshot, registration: dispensing.rx.doctor_registration_number_snapshot },
          prescription_reference: dispensing.rx.external_rx_number || dispensing.rx.prescription_number } : {}),
      };

      const invoiceNumber = await taxDocumentNumber(clinicId, 'S');

      // Insert Sale locally
      const sale = await localMutate({
        table: "sales",
        operation: "INSERT",
        data: {
          organization_id: organizationId,
          store_id: storeId,
          counter_id: counterId,
          terminal_id: terminalId,
          clinic_id: clinicId,
          customer_id: customerId,
          invoice_number: invoiceNumber,
          invoice_snapshot: invoiceSnapshot,
          price_includes_tax: parsed.price_includes_tax,
          subtotal: grandCalc.subtotal,
          discount: grandCalc.totalDiscount,
          gst_amount: grandCalc.totalGst,
          net_amount: grandCalc.grandTotal,
          grand_total: grandCalc.grandTotal,
          payment_mode: paymentMode,
          park_id: parsed.park_id,
          ...(dispensing ? {
            prescription_required: true, prescription_number: dispensing.rx.prescription_number,
            doctor_name: dispensing.rx.doctor_name_snapshot,
            doctor_registration_number: dispensing.rx.doctor_registration_number_snapshot,
          } : {}),
          wallet_redeemed_paise: walletAmount,
          wallet_checkout_hash: checkoutHash,
          payment_status:
            grandCalc.balanceDue > 0
              ? grandCalc.paidAmount > 0
                ? "partial"
                : "credit"
              : "paid",
          paid_amount: grandCalc.paidAmount,
          balance_due: grandCalc.balanceDue,
          served_by: req.user!.id,
          _local_id: parsed._local_id,
        },
      });

      const paymentTransactions = await postTenderEntries({
        clinicId, organizationId, storeId, terminalId,
        userId: req.user!.id, role: req.user!.role,
        registerId: parsed.register_id, registerRequired: parsed.register_required,
      }, sale.id, tenders);
      if (walletAmount > 0) await WalletService.redeem({clinicId,customerId:customerId!,actorId:req.user!.id},walletAmount,sale.id);

      // Insert Sale Items + Deduct Batch Stock + Adjust Inventory Position + Record Stock Ledger
      const itemRows: Record<string, any>[] = [];
      const ledgerRows: Record<string, any>[] = [];
      const stockUpdates = new Map<string, number>();
      for (const [index, calcEntry] of calculatedItems.entries()) {
        const { item, lineCalc, resolved } = calcEntry;
        const saleItemData = {
          organization_id: organizationId,
          store_id: storeId,
          clinic_id: clinicId,
          sale_id: sale.id,
          medicine_id: resolved.resolvedMedicineId,
          batch_id: resolved.resolvedBatchId,
          quantity: item.quantity,
          unit_price: item.mrp,
          discount_pct: item.discount_pct,
          gst_rate: item.gst_rate,
          total: lineCalc.total,
          invoice_line_snapshot: invoiceLines[index],
          _local_id: item._local_id,
        };

        itemRows.push(saleItemData);

        // Deduct stock atomically
        const newQuantity = resolved.currentStock - item.quantity;
        for (const entry of resolvedIdsMap.values())
          if (entry.resolvedBatchId === resolved.resolvedBatchId)
            entry.currentStock = newQuantity;
        stockUpdates.set(resolved.resolvedBatchId, newQuantity);

        if (storeId && organizationId) {
          await InventoryPositionService.getOrCreatePosition({organizationId,medicineId:resolved.resolvedMedicineId,
            batchId:resolved.resolvedBatchId,locationType:'STORE',storeId,initialStock:resolved.currentStock+item.quantity});
          await InventoryPositionService.adjustStock({organizationId,medicineId:resolved.resolvedMedicineId,
            batchId:resolved.resolvedBatchId,locationType:'STORE',storeId,quantityDelta:-item.quantity});
        }

        // Insert Immutable Stock Ledger Movement
        ledgerRows.push({
            organization_id: organizationId,
            store_id: storeId,
            counter_id: counterId,
            terminal_id: terminalId,
            clinic_id: clinicId,
            medicine_id: resolved.resolvedMedicineId,
            batch_id: resolved.resolvedBatchId,
            movement_type: "SALE",
            quantity_delta: -item.quantity,
            balance_after: newQuantity,
            reference_id: sale.id,
            performed_by: req.user!.id,
        });
      }

      // The reference loader holds row locks until commit. Persist all line
      // items, final stock balances and ledger movements in three round trips.
      const finalItems = (await localInsertMany("sale_items", itemRows)).map(item => ({...item,
        medicines: {name:references.medicines.get(item.medicine_id)?.name || ''},
        medicine_batches: {batch_number:references.batches.get(item.batch_id)?.batch_number || '', expiry_date:references.batches.get(item.batch_id)?.expiry_date || ''},
      }));
      await queryRaw(
        `UPDATE medicine_batches AS b SET quantity_remaining = u.quantity, updated_at = ?
         FROM jsonb_to_recordset(?::text::jsonb) AS u(id uuid, quantity integer)
         WHERE b.id = u.id AND b.clinic_id = ? AND b.deleted_at IS NULL`,
        [new Date().toISOString(), JSON.stringify([...stockUpdates].map(([id, quantity]) => ({ id, quantity }))), clinicId],
      );
      await localInsertMany("stock_ledger", ledgerRows);
      if (dispensing) await recordRegulatedDispensing(dispensingScope, sale.id, finalItems, dispensing);

      // Update Customer Outstanding Balance if credit/unpaid
      if (customerId && grandCalc.balanceDue > 0 && customerObj) {
        const updatedBalance = Money.add(
          customerObj.outstanding_balance || 0,
          grandCalc.balanceDue,
        );
        await localMutate({
          table: "customers",
          operation: "UPDATE",
          data: {
            _local_id: customerObj._local_id || customerObj.id,
            outstanding_balance: updatedBalance,
          },
        });
      }

      let earnedCoins=0;
      let finalSale=sale;
      if(customerId && coinPolicy && grandCalc.balanceDue===0){
        earnedCoins=await WalletService.earn({clinicId,customerId,actorId:req.user!.id},Money.toPaise(grandCalc.grandTotal),Math.max(0,Money.toPaise(grandCalc.paidAmount)-walletAmount),sale.id,coinPolicy);
        if(earnedCoins>0){
          const [award]=await queryRaw("SELECT expires_at FROM promo_wallet_ledger WHERE sale_id=? AND kind='EARN' ORDER BY sequence LIMIT 1",[sale.id]);
          finalSale=await localMutate({table:'sales',operation:'UPDATE',data:{_local_id:sale._local_id||sale.id,nex_coins_earned_paise:earnedCoins,nex_coins_expires_at:award.expires_at}});
        }
      }

      await recordCounterAudit(counterScope, sale.id, discountDecision, parsed.items.filter(item => item.allocation_mode === 'manual'));
      if (parsed.park_id) await ParkedSalesService.completeClaim(parsed.park_id, sale.id);

      // Refresh Daily Sales Summary in background
      afterPostgresCommit(() => {
        void DailySalesSummaryService.refresh();
      });

      res.status(201).json({ data: { ...sale,...finalSale, sale_items: finalItems, payment_transactions: paymentTransactions } });
    } catch (err) {
      next(err);
    }
  });

salesRouter.post("/", requireAuth, requireRole("PHARMACIST", "CASHIER", "OWNER"), enforcePlan,createSaleHandler);

// The same original-invoice lock protects quotes and checkout against concurrent returns.
salesRouter.get('/:id/return-options', requireAuth, requireRole('CASHIER','PHARMACIST','OWNER'), transactionalRoute(async(req,res,next)=>{
 try {
  const quote=await quoteCloudSaleReturn(req.user!.clinic_id!,req.params.id,[]);
  await resolveCloudStoreContext(req.user!.clinic_id!,{store_id:quote.original.store_id});
  res.json({data:{invoice:quote.original,items:quote.options.map(({batch,item,...option})=>option)}});
 }catch(error){next(error);}
}));

salesRouter.post('/returns/quote', requireAuth, requireRole('CASHIER','PHARMACIST','OWNER'), transactionalRoute(async(req,res,next)=>{
 try {
  const parsed=saleReturnSchema.parse(req.body);
  const quote=await quoteCloudSaleReturn(req.user!.clinic_id!,parsed.original_sale_id,parsed.items);
  await resolveCloudStoreContext(req.user!.clinic_id!,{store_id:quote.original.store_id});
  const refundTenders = await allocateRefundTenders({
    saleId: quote.original.id, originalMode: quote.original.payment_mode, refundMethod: parsed.refund_method,
    externalPaise: quote.external_refund_paise, creditPaise: quote.credit_reduction_paise, walletPaise: quote.wallet_refund_paise,
  });
  res.json({data:{total_refund_paise:quote.total_refund_paise,credit_reduction_paise:quote.credit_reduction_paise,
   refund_tenders:refundTenders,
   wallet_refund_paise:quote.wallet_refund_paise,external_refund_paise:quote.external_refund_paise,
   items:quote.selected.map(line=>({sale_item_id:line.sale_item_id,batch_id:line.batch_id,quantity:line.quantity,refund_paise:line.refund_paise,restock:line.restock}))}});
 }catch(error){next(error);}
}));

const voidSaleSchema = z.object({
  _local_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(400),
  restock: z.boolean(),
  refund_reference: z.string().trim().max(255).optional(),
  register_required: z.boolean().optional(),
});

export const saleReturnHandler = (legacy = false, voiding = false) => transactionalRoute(async (req, res, next) => {
 try {
  const voidInput = voiding ? voidSaleSchema.parse(req.body) : null;
  const parsed = voidInput
    ? { ...voidInput, original_sale_id: z.string().uuid().parse(req.params.id), refund_method: 'original' as const,
        items: [] as z.infer<typeof saleReturnSchema>['items'], store_id: undefined, expected_refund_paise: undefined, register_id: undefined }
    : saleReturnSchema.parse(req.body);
  const clinicId = req.user!.clinic_id!;
  const respond = (sale:any,note:any,items:any[],replayed=false) => {
   if(legacy) return res.status(201).json({data:{
    returnSaleId:sale.id,returnInvoiceNumber:sale.invoice_number,creditNoteNumber:note.credit_note_number,
    totalRefund:Number(note.total_refund_paise)/100,
    refundMethod:parsed.refund_method==='original'?'ORIGINAL_TENDER':parsed.refund_method.toUpperCase(),items,
   }});
   return res.json({data:{...sale,...(!replayed?{sale_items:items}:{replayed:true}),credit_note:note,external_refund_amount:Number(note?.external_refund_paise||0)/100}});
  };
  const requestId=parsed._local_id||req.get('Idempotency-Key');
  if(!requestId)throw new AppError(428,'A return request identifier is required','IDEMPOTENCY_KEY_REQUIRED');
  const hash=createHash('sha256').update(JSON.stringify(voidInput ? { voidInput, original_sale_id: parsed.original_sale_id } : parsed)).digest('hex');
  await queryRaw('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[`sale:${clinicId}:${requestId}`]);
  const existing=await queryOne('sales','_local_id=? AND clinic_id=?',[requestId,clinicId]);
  if(existing){
   await resolveCloudStoreContext(clinicId,{store_id:existing.store_id});
   if(existing.wallet_checkout_hash!==hash||!existing.is_return)throw new AppError(409,'This return identifier was already used for different details','IDEMPOTENCY_CONFLICT');
   const [note]=await queryRaw('SELECT * FROM sale_return_credit_notes WHERE return_sale_id=? AND clinic_id=?',[existing.id,clinicId]);
   const items=legacy?await queryRaw('SELECT * FROM sale_items WHERE sale_id=? AND clinic_id=? ORDER BY id',[existing.id,clinicId]):[];
   return void respond(existing,note,items,true);
  }
  if (voidInput) {
    const originalOptions = await quoteCloudSaleReturn(clinicId, parsed.original_sale_id, []);
    if (!originalOptions.options.length || originalOptions.options.some(line => line.returned_quantity > 0)) {
      throw new AppError(409, 'A bill with previous returns cannot be voided. Return any remaining units against the original invoice.');
    }
    parsed.items = originalOptions.options.map(line => ({
      sale_item_id: line.sale_item_id, batch_id: line.batch_id, quantity: line.sold_quantity,
      restock: voidInput.restock, reason: voidInput.reason,
    }));
  }
  const quote=await quoteCloudSaleReturn(clinicId,parsed.original_sale_id,parsed.items),original=quote.original;
  const context=await resolveCloudStoreContext(clinicId,{store_id:original.store_id,counter_id:original.counter_id,terminal_id:original.terminal_id});
  if(parsed.store_id&&parsed.store_id!==original.store_id)throw new AppError(403,'Return must be recorded against the original store');
  if(parsed.expected_refund_paise!==undefined&&parsed.expected_refund_paise!==quote.total_refund_paise)throw new AppError(409,'Refund changed. Refresh the return quote.','RETURN_QUOTE_CHANGED');
  const canRestock=['OWNER','PHARMACIST'].includes(req.user!.role);
  if (quote.selected.some(line => line.restock)) {
    const [clinical] = await queryRaw('SELECT id FROM regulated_dispensing WHERE sale_id = ? AND clinic_id = ?', [original.id, clinicId]);
    if (clinical) {
      const restricted = await queryRaw(
        `SELECT l.sale_item_id FROM regulated_dispensing_lines l WHERE l.dispensing_id = ?
         AND l.sale_item_id = ANY(?::uuid[])`,
        [clinical.id, quote.selected.filter(line => line.restock).map(line => line.sale_item_id)],
      );
      if (restricted.length) throw new AppError(409, 'Dispensed regulated medicines cannot be returned to sellable stock through this workflow.');
    }
  }
  const today=new Date().toISOString().slice(0,10);
  for(const line of quote.selected){
   if(line.restock&&!canRestock)throw new AppError(403,'A pharmacist or owner must approve restocking','RETURN_RESTOCK_APPROVAL_REQUIRED');
   if(line.restock&&(!line.batch||line.batch.deleted_at||line.batch.is_disposed||line.batch.is_recalled||!line.batch.expiry_date||new Date(line.batch.expiry_date).toISOString().slice(0,10)<today))throw new AppError(409,'Expired, disposed, recalled or missing batches cannot be restocked');
  }
  // Lock all affected batch rows in the same order used by checkout.
  const batchIds=[...new Set(quote.selected.filter(line=>line.restock).map(line=>line.batch_id))].sort();
  if (batchIds.length) {
    const locked = await queryRaw(
      `SELECT b.id FROM medicine_batches b
       WHERE b.clinic_id = ? AND b.id = ANY(?::uuid[]) AND b.deleted_at IS NULL
         AND NOT b.is_disposed AND NOT COALESCE(b.is_recalled, false) AND b.expiry_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
         AND NOT EXISTS (SELECT 1 FROM product_recalls r WHERE r.status = 'ACTIVE' AND r.deleted_at IS NULL
           AND r.product_id = b.medicine_id AND (r.batch_id IS NULL OR r.batch_id = b.id))
       ORDER BY b.id FOR UPDATE`, [clinicId, batchIds],
    );
    if (locked.length !== batchIds.length) throw new AppError(409, 'A returned batch is no longer eligible for restocking.');
  }
  const number=await taxDocumentNumber(clinicId, 'R');
  const creditSnapshots = quote.selected.map(line => line.item.invoice_line_snapshot
    ? snapshotCreditLine(line.item.invoice_line_snapshot, line.previous_refund_paise, line.refund_paise) : null);
  const creditSnapshot = original.invoice_snapshot ? {
    ...original.invoice_snapshot, original_invoice_number: original.invoice_number,
    ...Object.fromEntries(['taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise'].map(
      key => [key, creditSnapshots.reduce((sum, line) => sum + Number(line?.[key] ?? 0), 0)],
    )),
  } : null;
  const returned=await localMutate({table:'sales',operation:'INSERT',data:{...{
    organization_id:context.organizationId,store_id:context.storeId,counter_id:context.counterId,terminal_id:context.terminalId},
    clinic_id:clinicId,customer_id:original.customer_id,invoice_number:number,is_return:true,return_of:original.id,
    ...(creditSnapshot ? { invoice_snapshot: creditSnapshot,
      gst_amount: Money.toRupees(creditSnapshot.cgst_paise + creditSnapshot.sgst_paise + creditSnapshot.igst_paise),
      price_includes_tax: true } : {}),
    payment_mode:parsed.refund_method==='original'?original.payment_mode:parsed.refund_method,payment_status:'returned',served_by:req.user!.id,
    net_amount:Money.toRupees(quote.total_refund_paise),grand_total:Money.toRupees(quote.total_refund_paise),paid_amount:Money.toRupees(quote.total_refund_paise-quote.credit_reduction_paise),balance_due:0,
    wallet_redeemed_paise:quote.wallet_refund_paise,wallet_checkout_hash:hash,_local_id:requestId}});
  const lines=[];
  for(const [index, line] of quote.selected.entries()){
   const item=await localMutate({table:'sale_items',operation:'INSERT',data:{clinic_id:clinicId,organization_id:context.organizationId,store_id:context.storeId,
    sale_id:returned.id,sale_item_id:line.sale_item_id,medicine_id:line.medicine_id,batch_id:line.batch_id,quantity:line.quantity,
    unit_price:line.item.unit_price,discount_pct:line.item.discount_pct,gst_rate:line.item.gst_rate,total:Money.toRupees(line.refund_paise),reason:line.reason,
    invoice_line_snapshot: creditSnapshots[index],
    restock_decision:line.restock?'RESTOCK':'DO_NOT_RESTOCK'}});lines.push(item);
   if(line.restock){
    const [batch]=await queryRaw('SELECT * FROM medicine_batches WHERE id=? AND clinic_id=?',[line.batch_id,clinicId]);
    const restored=Number(batch.quantity_remaining)+line.quantity;
    if(context.organizationId&&context.storeId){
     await InventoryPositionService.getOrCreatePosition({organizationId:context.organizationId,storeId:context.storeId,medicineId:line.medicine_id,batchId:line.batch_id,locationType:'STORE',initialStock:Number(batch.quantity_remaining)});
     await InventoryPositionService.adjustStock({organizationId:context.organizationId,storeId:context.storeId,medicineId:line.medicine_id,batchId:line.batch_id,locationType:'STORE',quantityDelta:line.quantity});
    }
    await localMutate({table:'medicine_batches',operation:'UPDATE',data:{_local_id:batch._local_id||batch.id,quantity_remaining:restored}});
    await localMutate({table:'stock_ledger',operation:'INSERT',data:{clinic_id:clinicId,organization_id:context.organizationId,store_id:context.storeId,medicine_id:line.medicine_id,batch_id:line.batch_id,
     movement_type:'SALE_RETURN',quantity_delta:line.quantity,balance_after:restored,reference_id:returned.id,performed_by:req.user!.id,notes:line.reason}});
   }
  }
  if(original.customer_id){
   if(quote.wallet_refund_paise)await WalletService.refund({clinicId,customerId:original.customer_id,actorId:req.user!.id},original.id,returned.id,quote.wallet_refund_paise);
   await WalletService.reverseEarnings({clinicId,customerId:original.customer_id,actorId:req.user!.id},original.id,returned.id,Money.toPaise(quote.prior.returned)+quote.total_refund_paise);
   if(quote.credit_reduction_paise){
    const customer=await queryOne('customers','id=? AND clinic_id=?',[original.customer_id,clinicId]);
    if(!customer||Money.toPaise(customer.outstanding_balance||0)<quote.credit_reduction_paise)throw new AppError(409,'Customer outstanding balance needs reconciliation');
    await localMutate({table:'customers',operation:'UPDATE',data:{_local_id:customer._local_id||customer.id,outstanding_balance:Money.subtract(customer.outstanding_balance,quote.credit_reduction_paise/100)}});
    await localMutate({table:'sales',operation:'UPDATE',data:{_local_id:original._local_id||original.id,balance_due:Money.subtract(original.balance_due,quote.credit_reduction_paise/100)}});
   }
  }
  const note=await localMutate({table:'sale_return_credit_notes',operation:'INSERT',data:{id:randomUUID(),clinic_id:clinicId,original_sale_id:original.id,return_sale_id:returned.id,
   credit_note_number:number,refund_method:parsed.refund_method,total_refund_paise:quote.total_refund_paise,credit_reduction_paise:quote.credit_reduction_paise,wallet_refund_paise:quote.wallet_refund_paise,
   external_refund_paise:quote.external_refund_paise,performed_by:req.user!.id,approved_by:quote.selected.some(line=>line.restock)?req.user!.id:null,reason:parsed.items.map(item=>item.reason).join('; '),refund_reference:parsed.refund_reference}});
  const refundTenders = await allocateRefundTenders({
    saleId: original.id, originalMode: original.payment_mode, refundMethod: parsed.refund_method,
    reference: parsed.refund_reference, externalPaise: quote.external_refund_paise,
    creditPaise: quote.credit_reduction_paise, walletPaise: quote.wallet_refund_paise,
  });
  await postTenderEntries({
    clinicId, ...context, userId: req.user!.id, role: req.user!.role,
    registerId: parsed.register_id, registerRequired: parsed.register_required,
  }, original.id, refundTenders, returned.id);
  if (voidInput) {
    await queryRaw(
      `INSERT INTO sale_voids (sale_id, reversal_id, clinic_id, approved_by, reason, restock)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [original.id, returned.id, clinicId, req.user!.id, voidInput.reason, voidInput.restock],
    );
  }
  afterPostgresCommit(()=>{void DailySalesSummaryService.refresh();});
  respond(returned,note,lines);
 }catch(error){next(error);}
});
export const createSaleReturnHandler = saleReturnHandler();

salesRouter.post('/:id/void', requireAuth, requireRole('OWNER'), saleReturnHandler(false, true));
salesRouter.post('/returns', requireAuth, requireRole('CASHIER','PHARMACIST','OWNER'),createSaleReturnHandler);

// GET /api/sales/:id/invoice
salesRouter.get("/:id/invoice", requireAuth, async (req, res, next) => {
  try {
    const sale = (await queryOne(
      "sales",
      "(_local_id=? OR id=?) AND clinic_id=?",
      [req.params.id, req.params.id, req.user!.clinic_id!],
    )) as any;
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    await assertSaleStore(req.user!.clinic_id!, sale.store_id);

    const saleItems = await queryAll(
      "sale_items",
      "sale_id=? AND clinic_id=?",
      [sale.id, req.user!.clinic_id!],
    );
    const clinic = (await queryOne("clinics", "id=?", [
      req.user!.clinic_id!,
    ])) as any;

    // Attach medicine names
    for (const item of saleItems) {
      if ((item as any).medicine_id) {
        const med = await queryOne("medicines", "_local_id=? OR id=?", [
          (item as any).medicine_id,
          (item as any).medicine_id,
        ]);
        (item as any).medicines = { name: (med as any)?.name ?? "" };
      }
      if ((item as any).batch_id) {
        const batch = await queryOne(
          "medicine_batches",
          "_local_id=? OR id=?",
          [(item as any).batch_id, (item as any).batch_id],
        );
        (item as any).medicine_batches = {
          batch_number: (batch as any)?.batch_number ?? "",
          expiry_date: (batch as any)?.expiry_date ?? "",
        };
      }
    }

    let customerName = "Walk-in";
    if (sale.customer_id) {
      const cust = await queryOne("customers", "_local_id=? OR id=?", [
        sale.customer_id,
        sale.customer_id,
      ]);
      customerName = (cust as any)?.name ?? "Walk-in";
    }

    const originalInvoice=sale.is_return&&sale.return_of ? await queryOne('sales','id=? AND clinic_id=?',[sale.return_of,req.user!.clinic_id!]) : null;
    const [creditNote]=sale.is_return ? await queryRaw('SELECT * FROM sale_return_credit_notes WHERE return_sale_id=? AND clinic_id=?',[sale.id,req.user!.clinic_id!]) : [];
    const [voidRecord] = await queryRaw(
      'SELECT * FROM sale_voids WHERE clinic_id = ? AND (sale_id = ? OR reversal_id = ?)',
      [req.user!.clinic_id!, sale.id, sale.id],
    );
    const snapshot = sale.invoice_snapshot;
    const seller = snapshot?.seller ?? {
      name: clinic?.name, address: clinic?.address, gstin: clinic?.gstin, drug_licence: clinic?.drug_licence_number,
    };
    const rupees = (paise: number) => escapeInvoiceHtml((Number(paise) / 100).toFixed(2));
    const invoiceDate = new Date(sale.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const html = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <h2>${escapeInvoiceHtml(seller.name || "Medical Store")}</h2>
          <p>${escapeInvoiceHtml(seller.address || "")}<br/>GSTIN: ${escapeInvoiceHtml(seller.gstin || "N/A")}<br/>Drug licence: ${escapeInvoiceHtml(seller.drug_licence || "N/A")}</p>
          <hr />
          <h3>${sale.is_return ? 'Credit note' : seller.gstin ? 'Tax invoice' : 'Invoice'} #${escapeInvoiceHtml(sale.invoice_number)}</h3>
          ${voidRecord ? `<p><strong>${sale.is_return ? 'Cancellation reversal' : 'Voided invoice'}</strong><br/>Reason: ${escapeInvoiceHtml(voidRecord.reason)}</p>` : ''}
          ${sale.is_return ? `<p>Original invoice: ${escapeInvoiceHtml(originalInvoice?.invoice_number)}<br/>Reason: ${escapeInvoiceHtml(creditNote?.reason)}<br/>Refund method: ${escapeInvoiceHtml(creditNote?.refund_method)}<br/>External refund: ₹${escapeInvoiceHtml(Number(creditNote?.external_refund_paise||0)/100)}</p>` : ''}
          <p>Date: ${escapeInvoiceHtml(invoiceDate)}<br/>
             Customer: ${escapeInvoiceHtml(snapshot?.buyer?.name || customerName)}
             ${snapshot?.buyer?.address ? `<br/>Recipient address: ${escapeInvoiceHtml(snapshot.buyer.address)}` : ''}
             ${snapshot?.buyer?.gstin ? `<br/>Recipient GSTIN: ${escapeInvoiceHtml(snapshot.buyer.gstin)}` : ''}
             ${snapshot?.place_of_supply ? `<br/>Place of supply (State code): ${escapeInvoiceHtml(snapshot.place_of_supply)}` : ''}
             ${snapshot?.delivery_address && snapshot.delivery_address !== snapshot.buyer?.address ? `<br/>Delivery: ${escapeInvoiceHtml(snapshot.delivery_address)}` : ''}
             ${snapshot?.pharmacist ? `<br/>Pharmacist: ${escapeInvoiceHtml(snapshot.pharmacist.name)} · ${escapeInvoiceHtml(snapshot.pharmacist.registration)}` : ''}
             ${snapshot?.prescriber ? `<br/>Prescriber: ${escapeInvoiceHtml(snapshot.prescriber.name)} · ${escapeInvoiceHtml(snapshot.prescriber.registration)}<br/>Prescription: ${escapeInvoiceHtml(snapshot.prescription_reference)}` : ''}
             ${seller.gstin ? '<br/>Reverse charge: No' : ''}</p>
          <table>
             <tr><th>Item</th><th>Batch/Exp</th><th>Qty</th><th>MRP</th><th>Total</th></tr>
             ${(saleItems as any[])
               .map(
                 (i) => `
                <tr>
                  <td>${escapeInvoiceHtml(i.invoice_line_snapshot?.product_name || i.medicines?.name || "")}
                    ${i.invoice_line_snapshot?.manufacturer ? `<br/>Manufacturer: ${escapeInvoiceHtml(i.invoice_line_snapshot.manufacturer)}` : ''}
                    ${i.invoice_line_snapshot?.hsn_code ? `<br/>HSN ${escapeInvoiceHtml(i.invoice_line_snapshot.hsn_code)}` : ''}
                  </td>
                  <td>${escapeInvoiceHtml(i.invoice_line_snapshot?.batch_number || i.medicine_batches?.batch_number || "")}
                    / ${escapeInvoiceHtml(String(i.invoice_line_snapshot?.expiry_date || i.medicine_batches?.expiry_date || "").slice(0, 10))}</td>
                  <td>${escapeInvoiceHtml(i.quantity)} ${escapeInvoiceHtml(i.invoice_line_snapshot?.unit || '')}</td>
                  <td>${escapeInvoiceHtml(i.unit_price||i.mrp)}</td>
                  <td class="right">${i.invoice_line_snapshot
                    ? `${rupees(i.invoice_line_snapshot.gross_paise)}<br/>Taxable ${rupees(i.invoice_line_snapshot.taxable_paise)} · GST ${escapeInvoiceHtml(i.gst_rate)}%`
                    : escapeInvoiceHtml(i.total)}</td>
                </tr>
             `,
               )
               .join("")}
             <tr><th colspan="4" class="right">Subtotal</th><th class="right">${escapeInvoiceHtml(sale.subtotal)}</th></tr>
             <tr><th colspan="4" class="right">Discount</th><th class="right">${escapeInvoiceHtml(sale.discount)}</th></tr>
             ${snapshot ? `<tr><th colspan="4" class="right">Taxable value</th><th class="right">${rupees(snapshot.taxable_paise)}</th></tr>
             ${snapshot.is_interstate ? `<tr><th colspan="4" class="right">IGST</th><th class="right">${rupees(snapshot.igst_paise)}</th></tr>` :
              `<tr><th colspan="4" class="right">CGST</th><th class="right">${rupees(snapshot.cgst_paise)}</th></tr>
               <tr><th colspan="4" class="right">SGST</th><th class="right">${rupees(snapshot.sgst_paise)}</th></tr>`}` : ''}
             <tr><th colspan="4" class="right">${sale.price_includes_tax ? 'GST (included)' : 'GST'}</th><th class="right">${escapeInvoiceHtml(sale.gst_amount)}</th></tr>
             <tr><th colspan="4" class="right"><strong>Grand Total</strong></th><th class="right"><strong>${escapeInvoiceHtml(sale.net_amount)}</strong></th></tr>
             ${Number(sale.nex_coins_earned_paise||0)>0?`<tr><th colspan="4" class="right">Nex Coins earned</th><td class="right">${escapeInvoiceHtml(Number(sale.nex_coins_earned_paise)/100)}</td></tr>`:''}
             ${Number(sale.wallet_redeemed_paise||0)>0?`<tr><th colspan="4" class="right">Nex Coins</th><td class="right">${escapeInvoiceHtml(Number(sale.wallet_redeemed_paise)/100)}</td></tr><tr><th colspan="4" class="right">Collected payment</th><td class="right">${escapeInvoiceHtml(Money.subtract(sale.paid_amount,Number(sale.wallet_redeemed_paise)/100))}</td></tr>`:''}
          </table>
          <p style="margin-top:20px; font-size:12px;">${escapeInvoiceHtml(clinic?.invoice_footer || "")}</p>
          ${seller.gstin ? '<p>Authorised signature ____________________</p>' : ''}
        </body>
      </html>
    `;

    res.json({
      data: { html, sale: { ...sale, sale_items: saleItems }, clinic },
    });
  } catch (err) {
    next(err);
  }
});

export default salesRouter;
