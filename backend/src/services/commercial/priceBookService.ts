import { AppError } from '../../lib/appError';
import { tenantRecord } from '../../lib/tenantRecords';
import { businessDb as localDb } from '../../lib/businessDb';
import { localMutate } from '../../lib/localMutate';
import { Money } from '../../lib/money';
import { v4 as uuidv4 } from 'uuid';
import {
  PriceBook,
  PriceBookItem,
  PriceBookScope,
  ResolvedPriceHierarchy,
} from '../../domain/commercialTypes';

export interface ResolvePriceParams {
  organizationId: string;
  storeId?: string | null;
  regionId?: string | null;
  customerId?: string | null;
  customerGroupId?: string | null;
  medicineId: string;
  batchId?: string | null;
  unitType?: string;
  conversionFactor?: number;
  asOfDate?: Date;
}

export class PriceBookService {
  /**
   * Resolves the authoritative base price hierarchy for a product in a given store/org/customer context.
   */
  static async resolveHierarchy(params: ResolvePriceParams): Promise<ResolvedPriceHierarchy> {
    const {
      organizationId,
      storeId,
      regionId,
      customerGroupId,
      medicineId,
      batchId,
      unitType = 'STRIP',
      conversionFactor = 1.0,
      asOfDate = new Date(),
    } = params;

    const asOfIso = asOfDate.toISOString();

    // 1. Fetch medicine and batch defaults as absolute baseline
    const medRow = (await tenantRecord('medicines', medicineId, organizationId));

    let batchRow: any = null;
    if (batchId) {
      batchRow = (await tenantRecord('medicine_batches', batchId, organizationId));
      if (![medRow.id, medRow._local_id].includes(batchRow.medicine_id)) throw new AppError(404, 'Batch not found', 'BATCH_NOT_FOUND');
    } else {
      batchRow = (await localDb
        .prepare(
          `SELECT * FROM medicine_batches
           WHERE organization_id = ? AND (medicine_id = ? OR medicine_id = ?) AND (store_id = ? OR store_id IS NULL)
             AND quantity_remaining > 0 AND _deleted = 0
           ORDER BY expiry_date ASC LIMIT 1`
        )
        .get(organizationId, medicineId, medicineId, storeId || null));
    }

    const defaultMrp = Number(batchRow?.mrp ?? medRow?.mrp ?? 0);
    const defaultCost = Number(batchRow?.purchase_price ?? 0);
    const defaultMrpPaise = Money.toPaise(defaultMrp * conversionFactor);
    const defaultCostPaise = Money.toPaise(defaultCost * conversionFactor);

    // Fallback baseline object
    const defaultHierarchy: ResolvedPriceHierarchy = {
      mrpPaise: defaultMrpPaise,
      basePricePaise: defaultMrpPaise,
      minAllowedPricePaise: defaultCostPaise,
      maxDiscountPct: 100.0,
      source: 'MASTER_CATALOG',
      sourceName: 'Master Product Catalogue',
      priority: 0,
    };

    if (!organizationId) {
      return defaultHierarchy;
    }

    // 2. Query applicable active price books in order of precedence:
    // STORE (priority 400+) > REGION (300+) > ORG (200+) > CUSTOMER_GROUP (100+)
    const candidatePriceBooks: Array<PriceBook & { resolvedPriority: number; scope_type: string }> = [];

    // 2a. Store Scoped Price Books
    if (storeId) {
      const storePbs: any[] = (await localDb
        .prepare(
          `SELECT pb.*, pbs.scope_type, (pb.priority + 400) as resolvedPriority
           FROM price_books pb
           JOIN price_book_scopes pbs ON pbs.price_book_id = pb.id OR pbs.price_book_id = pb._local_id
           WHERE (pb.organization_id = ?)
             AND pb.status = 'ACTIVE' AND pb._deleted = 0
             AND pbs.scope_type = 'STORE' AND (pbs.scope_id = ? OR pbs.scope_id = ?)
             AND (pb.start_at IS NULL OR pb.start_at <= ?)
             AND (pb.end_at IS NULL OR pb.end_at >= ?)`
        )
        .all(organizationId, storeId, storeId, asOfIso, asOfIso));
      candidatePriceBooks.push(...storePbs);
    }

    // 2b. Region Scoped Price Books
    if (regionId) {
      const regionPbs: any[] = (await localDb
        .prepare(
          `SELECT pb.*, pbs.scope_type, (pb.priority + 300) as resolvedPriority
           FROM price_books pb
           JOIN price_book_scopes pbs ON pbs.price_book_id = pb.id OR pbs.price_book_id = pb._local_id
           WHERE (pb.organization_id = ?)
             AND pb.status = 'ACTIVE' AND pb._deleted = 0
             AND pbs.scope_type = 'REGION' AND (pbs.scope_id = ? OR pbs.scope_id = ?)
             AND (pb.start_at IS NULL OR pb.start_at <= ?)
             AND (pb.end_at IS NULL OR pb.end_at >= ?)`
        )
        .all(organizationId, regionId, regionId, asOfIso, asOfIso));
      candidatePriceBooks.push(...regionPbs);
    }

    // 2c. Organization Scoped Price Books
    const orgPbs: any[] = (await localDb
      .prepare(
        `SELECT pb.*, 'ORGANIZATION' as scope_type, (pb.priority + 200) as resolvedPriority
         FROM price_books pb
         WHERE (pb.organization_id = ?)
           AND pb.status = 'ACTIVE' AND pb._deleted = 0
           AND (pb.scope = 'ORGANIZATION' OR pb.is_default = 1)
           AND (pb.start_at IS NULL OR pb.start_at <= ?)
           AND (pb.end_at IS NULL OR pb.end_at >= ?)`
      )
      .all(organizationId, asOfIso, asOfIso));
    candidatePriceBooks.push(...orgPbs);

    // 2d. Customer Group Price Books
    if (customerGroupId) {
      const cgPbs: any[] = (await localDb
        .prepare(
          `SELECT pb.*, 'CUSTOMER_GROUP' as scope_type, (pb.priority + 100) as resolvedPriority
           FROM price_books pb
           JOIN customer_groups cg ON (cg.default_price_book_id = pb.id OR cg.default_price_book_id = pb._local_id)
           WHERE (pb.organization_id = ?)
             AND (cg.id = ? OR cg._local_id = ?)
             AND pb.status = 'ACTIVE' AND pb._deleted = 0
             AND (pb.start_at IS NULL OR pb.start_at <= ?)
             AND (pb.end_at IS NULL OR pb.end_at >= ?)`
        )
        .all(organizationId, customerGroupId, customerGroupId, asOfIso, asOfIso));
      candidatePriceBooks.push(...cgPbs);
    }

    // Sort candidate price books by resolvedPriority DESC
    candidatePriceBooks.sort((a, b) => b.resolvedPriority - a.resolvedPriority);

    // 3. For each candidate price book, check if item override exists
    for (const pb of candidatePriceBooks) {
      const pbId = pb.id || pb._local_id;
      const itemRow: any = (await localDb
        .prepare(
          `SELECT * FROM price_book_items
           WHERE (price_book_id = ? OR price_book_id = ?)
             AND (medicine_id = ? OR medicine_id = ?)
             AND is_active = 1 AND _deleted = 0
             AND (start_at IS NULL OR start_at <= ?)
             AND (end_at IS NULL OR end_at >= ?)
           LIMIT 1`
        )
        .get(pbId, pbId, medicineId, medicineId, asOfIso, asOfIso));

      if (itemRow) {
        const factor = (itemRow.unit_type === unitType) ? 1.0 : conversionFactor;
        const itemMrpPaise = Math.round((Number(itemRow.mrp_paise) || defaultMrpPaise) * factor);
        const itemSellingPricePaise = Math.round(Number(itemRow.selling_price_paise) * factor);
        const itemMinPricePaise = Math.round((Number(itemRow.min_price_paise) || defaultCostPaise) * factor);
        const maxDiscountPct = Number(itemRow.max_discount_pct ?? 100.0);

        let source: ResolvedPriceHierarchy['source'] = 'ORG_PRICE_BOOK';
        if (pb.scope_type === 'STORE') source = 'STORE_PRICE_BOOK';
        else if (pb.scope_type === 'REGION') source = 'REGION_PRICE_BOOK';
        else if (pb.scope_type === 'CUSTOMER_GROUP') source = 'CUSTOMER_GROUP_PRICE_BOOK';

        return {
          mrpPaise: itemMrpPaise,
          basePricePaise: itemSellingPricePaise,
          minAllowedPricePaise: itemMinPricePaise,
          maxDiscountPct,
          source,
          sourceId: pbId,
          sourceName: pb.name,
          priority: pb.resolvedPriority,
        };
      }
    }

    // Return default if no specific price book item matched
    return defaultHierarchy;
  }

  /**
   * Helper: Seeds a default retail price book for an organization if missing
   */
  static async ensureDefaultRetailPriceBook(organizationId: string): Promise<PriceBook> {
    const existing: any = (await localDb
      .prepare('SELECT * FROM price_books WHERE organization_id = ? AND is_default = 1 AND _deleted = 0')
      .get(organizationId));

    if (existing) return existing;

    const id = uuidv4();
    const pb = (await localMutate({
      table: 'price_books',
      operation: 'INSERT',
      data: {
        id,
        _local_id: id,
        organization_id: organizationId,
        code: 'STD_RETAIL',
        name: 'Standard Retail Price Book',
        description: 'Default store retail price book',
        currency: 'INR',
        priority: 10,
        status: 'ACTIVE',
        scope: 'ORGANIZATION',
        is_default: 1,
      },
    }));

    return pb as PriceBook;
  }

  /**
   * Price Book CRUD
   */
  static async listPriceBooks(organizationId: string): Promise<PriceBook[]> {
    return (await localDb
      .prepare(
        `SELECT pb.*,
          (SELECT COUNT(*) FROM price_book_items WHERE price_book_id = pb.id OR price_book_id = pb._local_id) as item_count
         FROM price_books pb
         WHERE (pb.organization_id = ?) AND pb._deleted = 0
         ORDER BY pb.priority DESC, pb.created_at DESC`
      )
      .all(organizationId)) as PriceBook[];
  }

  static async createPriceBook(data: Partial<PriceBook> & { scopes?: PriceBookScope[] }): Promise<PriceBook> {
    const id = data.id || uuidv4();
    const pb = (await localMutate({
      table: 'price_books',
      operation: 'INSERT',
      data: {
        id,
        _local_id: id,
        organization_id: data.organization_id,
        code: data.code || `PB_${Date.now()}`,
        name: data.name,
        description: data.description || '',
        currency: data.currency || 'INR',
        priority: data.priority ?? 10,
        status: data.status || 'ACTIVE',
        scope: data.scope || 'ORGANIZATION',
        is_default: data.is_default ? 1 : 0,
        start_at: data.start_at || null,
        end_at: data.end_at || null,
      },
    }));

    if (Array.isArray(data.scopes) && data.scopes.length > 0) {
      for (const s of data.scopes) {
        const sId = uuidv4();
        (await localMutate({
          table: 'price_book_scopes',
          operation: 'INSERT',
          data: {
            id: sId,
            _local_id: sId,
            organization_id: data.organization_id,
            price_book_id: id,
            scope_type: s.scope_type,
            scope_id: s.scope_id,
          },
        }));
      }
    }

    return pb as PriceBook;
  }

  static async setPriceBookItem(data: Partial<PriceBookItem>): Promise<PriceBookItem> {
    const id = data.id || uuidv4();
    const existing: any = (await localDb
      .prepare(
        `SELECT * FROM price_book_items
         WHERE (price_book_id = ? OR price_book_id = ?) AND (medicine_id = ? OR medicine_id = ?) AND _deleted = 0`
      )
      .get(data.price_book_id, data.price_book_id, data.medicine_id, data.medicine_id));

    if (existing) {
      const updated = (await localMutate({
        table: 'price_book_items',
        operation: 'UPDATE',
        data: {
          _local_id: existing._local_id,
          mrp_paise: data.mrp_paise ?? existing.mrp_paise,
          selling_price_paise: data.selling_price_paise ?? existing.selling_price_paise,
          min_price_paise: data.min_price_paise ?? existing.min_price_paise,
          max_discount_pct: data.max_discount_pct ?? existing.max_discount_pct,
          is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
          start_at: data.start_at || existing.start_at,
          end_at: data.end_at || existing.end_at,
        },
      }));
      return updated as PriceBookItem;
    }

    const created = (await localMutate({
      table: 'price_book_items',
      operation: 'INSERT',
      data: {
        id,
        _local_id: id,
        organization_id: data.organization_id,
        price_book_id: data.price_book_id,
        medicine_id: data.medicine_id,
        batch_id: data.batch_id || null,
        unit_type: data.unit_type || 'STRIP',
        mrp_paise: data.mrp_paise,
        selling_price_paise: data.selling_price_paise,
        min_price_paise: data.min_price_paise ?? 0,
        max_discount_pct: data.max_discount_pct ?? 100.0,
        start_at: data.start_at || null,
        end_at: data.end_at || null,
        is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      },
    }));
    return created as PriceBookItem;
  }

  static async setPriceBookScope(data: Partial<PriceBookScope>): Promise<PriceBookScope> {
    const id = data.id || uuidv4();
    const created = (await localMutate({
      table: 'price_book_scopes',
      operation: 'INSERT',
      data: {
        id,
        _local_id: id,
        organization_id: data.organization_id,
        price_book_id: data.price_book_id,
        scope_type: data.scope_type || 'ORGANIZATION',
        scope_id: data.scope_id || null,
      },
    }));
    return created as PriceBookScope;
  }
}
