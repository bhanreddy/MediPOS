import { createHash } from 'node:crypto';
import { AppError } from '../../lib/appError';
import { tenantRecord } from '../../lib/tenantRecords';
// stockTransferService.ts — Enterprise Stock Transfer Document Lifecycle Engine
import { businessDb as localDb, cloudBusinessMode, lockBusinessRows } from '../../lib/businessDb';
import { queryRaw, withPostgresSavepoint } from '../../lib/postgresDb';
import { localMutate } from '../../lib/localMutate';
import { v4 as uuidv4 } from 'uuid';
import {
  StockTransfer,
  StockTransferItem,
  TransferType,
  TransferPriority,
  TransferSourceReason,
} from '../../domain/transferTypes';
import { LocationType } from '../../domain/units';
import { DocumentNumberingService } from '../documentNumbering';
import { LocationService } from './locationService';
import { TransferPolicyService } from './transferPolicyService';
import { TransferAllocationService } from './transferAllocationService';

export class StockTransferService {
  /**
   * Create a new Stock Transfer in DRAFT or REQUESTED status
   */
  static async createTransfer(params: {
    organizationId: string;
    transferType: TransferType;
    sourceLocationType: LocationType;
    sourceLocationId: string;
    destinationLocationType: LocationType;
    destinationLocationId: string;
    priority?: TransferPriority;
    reason?: TransferSourceReason;
    requestedBy: string;
    requiredByDate?: string;
    stockStateTransferred?: 'AVAILABLE' | 'QUARANTINED' | 'RECALLED' | 'DAMAGED';
    notes?: string;
    idempotencyKey?: string;
    requireAvailableStock?: boolean;
    items: Array<{
      medicineId: string;
      requestedUnit?: string;
      conversionFactor?: number;
      requestedQuantity: number;
      notes?: string;
    }>;
  }): Promise<StockTransfer> {
    const {
      organizationId,
      transferType,
      sourceLocationType,
      sourceLocationId,
      destinationLocationType,
      destinationLocationId,
      priority = 'NORMAL',
      reason = 'MANUAL',
      requestedBy,
      requiredByDate,
      stockStateTransferred = 'AVAILABLE',
      notes,
      idempotencyKey,
      items,
    } = params;

    if(cloudBusinessMode()&&idempotencyKey){const {postgresQuery}=await import('../../lib/postgresDb');await postgresQuery('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`transfer:${organizationId}:${idempotencyKey}`]);}
    // Organization validation & Isolation
    const sourceLoc = (await LocationService.resolveLocation(sourceLocationType, sourceLocationId, organizationId));
    const destLoc = (await LocationService.resolveLocation(destinationLocationType, destinationLocationId, organizationId));

    if (sourceLoc.organizationId !== destLoc.organizationId) {
      throw new Error(`Cross-organization transfer blocked between ${sourceLoc.organizationId} and ${destLoc.organizationId}`);
    }

    if (sourceLocationType === destinationLocationType && sourceLocationId === destinationLocationId) {
      throw new Error('Source location and destination location cannot be identical');
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
      throw new Error('Transfer must include at least one medicine item');
    }

    if (cloudBusinessMode()) {
      const validItems = items.every(item => typeof item.medicineId === 'string'
        && Number.isSafeInteger(item.requestedQuantity) && item.requestedQuantity > 0
        && (item.conversionFactor === undefined || Number.isFinite(item.conversionFactor) && item.conversionFactor > 0));
      if (!validItems) throw new AppError(400, 'Transfer quantities must be positive whole numbers.');
      const checks = await Promise.all([
        LocationService.validateUserAccess(requestedBy, sourceLocationType, sourceLoc.id, organizationId),
        LocationService.validateUserAccess(requestedBy, destinationLocationType, destLoc.id, organizationId),
      ]);
      if (checks.some(allowed => !allowed)) throw new AppError(403, 'Access to both transfer locations is required.');
    }

    const requestHash = cloudBusinessMode() && idempotencyKey
      ? createHash('sha256').update(JSON.stringify([
          requestedBy, transferType, sourceLocationType, sourceLoc.id, destinationLocationType,
          destLoc.id, priority, reason, requiredByDate ?? null, stockStateTransferred, notes ?? null,
          items.map(item => [item.medicineId, item.requestedQuantity, item.requestedUnit ?? null,
            item.conversionFactor ?? null, item.notes ?? null]),
        ])).digest('hex')
      : null;
    if (idempotencyKey) {
      const existing: any = (await localDb
        .prepare('SELECT * FROM stock_transfers WHERE idempotency_key = ? AND organization_id = ? AND _deleted = 0')
        .get(idempotencyKey, organizationId));
      if (existing) {
        if (cloudBusinessMode() && (existing.requested_by !== requestedBy ||
            existing.source_location_id !== sourceLoc.id || existing.destination_location_id !== destLoc.id ||
            (existing.creation_request_hash && existing.creation_request_hash !== requestHash))) {
          throw new AppError(409, 'This transfer request identifier was used for different details.');
        }
        return (await this.getTransferById(existing.id, organizationId))!;
      }
    }

    if (cloudBusinessMode() && params.requireAvailableStock) {
      for (const item of items) {
        const [stock] = await queryRaw(
          'SELECT COALESCE(SUM(available),0) AS units FROM branch_stock_snapshot WHERE store_id=? AND medicine_id=?',
          [sourceLoc.id,item.medicineId],
        );
        if (Number(stock.units) < item.requestedQuantity) {
          throw new AppError(409, 'Available stock has changed at the source branch.');
        }
      }
    }

    for (const item of items) (await tenantRecord('medicines', item.medicineId, organizationId));

    const transferId = uuidv4();
    const nowIso = new Date().toISOString();
    const customPrefix = `${sourceLoc.code || 'SRC'}/${destLoc.code || 'DST'}/TRF`;
    const transferNumber = (await DocumentNumberingService.generate({
      organizationId,
      storeId: sourceLocationType === 'STORE' ? sourceLocationId : null,
      documentType: 'TRANSFER',
      customPrefix,
    }));

    let totalQuantity = 0;
    let totalEstimatedValuePaise = 0;

    const transfer = (await localMutate({
      table: 'stock_transfers',
      operation: 'INSERT',
      data: {
        id: transferId,
        _local_id: transferId,
        organization_id: organizationId,
        transfer_number: transferNumber,
        transfer_type: transferType,
        source_location_type: sourceLocationType,
        source_location_id: sourceLocationId,
        destination_location_type: destinationLocationType,
        destination_location_id: destinationLocationId,
        source_name: sourceLoc.name,
        destination_name: destLoc.name,
        priority,
        reason,
        status: 'REQUESTED',
        stock_state_transferred: stockStateTransferred,
        total_items: items.length,
        total_quantity_requested: 0,
        total_value_paise: 0,
        requested_by: requestedBy,
        requested_at: nowIso,
        required_by_date: requiredByDate || null,
        notes: notes || null,
        idempotency_key: idempotencyKey || null,
        ...(requestHash ? { creation_request_hash: requestHash } : {}),
      },
    }));

    for (const item of items) {
      const med = (await tenantRecord('medicines', item.medicineId, organizationId));

      const convFactor = item.conversionFactor || 1.0;
      const baseQty = item.requestedQuantity * convFactor;
      const unitCost = Math.round(Number(med?.purchase_price || 0) * 100);
      const lineValue = Math.round(baseQty * unitCost);

      totalQuantity += baseQty;
      totalEstimatedValuePaise += lineValue;

      const itemId = uuidv4();
      (await localMutate({
        table: 'stock_transfer_items',
        operation: 'INSERT',
        data: {
          id: itemId,
          _local_id: itemId,
          transfer_id: transferId,
          organization_id: organizationId,
          medicine_id: item.medicineId,
          medicine_name: med?.name || 'Unknown Item',
          requested_unit: item.requestedUnit || 'strip',
          conversion_factor: convFactor,
          requested_quantity: item.requestedQuantity,
          base_quantity_requested: baseQty,
          unit_cost_paise: unitCost,
          total_value_paise: lineValue,
          notes: item.notes || null,
        },
      }));
    }

    (await localMutate({
      table: 'stock_transfers',
      operation: 'UPDATE',
      data: {
        _local_id: transferId,
        total_quantity_requested: totalQuantity,
        total_value_paise: totalEstimatedValuePaise,
      },
    }));

    // Write audit event
    (await localMutate({
      table: 'transfer_events',
      operation: 'INSERT',
      data: {
        id: uuidv4(),
        transfer_id: transferId,
        organization_id: organizationId,
        event_type: 'REQUESTED',
        from_status: 'DRAFT',
        to_status: 'REQUESTED',
        performed_by: requestedBy,
        notes: `Created transfer request for ${items.length} SKUs`,
      },
    }));

    // Check policy auto-approval
    const policyRole = (await TransferPolicyService.getRequiredApprovalRole(
      organizationId,
      totalEstimatedValuePaise,
      transferType
    ));
    if (policyRole === 'AUTO') {
      return (await this.approveTransfer({
        transferId,
        organizationId,
        approvedBy: 'SYSTEM_AUTO',
        userRole: 'SYSTEM',
      }));
    }

    return (await this.getTransferById(transferId, organizationId))!;
  }

  /**
   * Approve a transfer request
   */
  static async approveTransfer(params: {
    transferId: string;
    organizationId: string;
    approvedBy: string;
    userRole?: string;
  }): Promise<StockTransfer> {
    const { transferId, organizationId, approvedBy, userRole } = params;

    await lockBusinessRows('stock_transfers',[transferId]);
    const transfer: any = (await localDb
      .prepare(
        `SELECT * FROM stock_transfers 
         WHERE (id = ? OR _local_id = ?) AND (organization_id = ?) AND _deleted = 0`
      )
      .get(transferId, transferId, organizationId));

    if (!transfer) throw new Error(`Transfer not found: ${transferId}`);

    if (transfer.status !== 'REQUESTED' && transfer.status !== 'PENDING_APPROVAL') {
      throw new Error(`Cannot approve transfer in status: ${transfer.status}`);
    }

    const policy = (await TransferPolicyService.getPolicy(organizationId));

    // Maker-checker validation
    if (policy.enforceMakerChecker && transfer.requested_by === approvedBy && approvedBy !== 'SYSTEM_AUTO') {
      throw new Error('Maker-Checker Violation: Transfer creator cannot approve their own transfer');
    }

    const nowIso = new Date().toISOString();
    (await localMutate({
      table: 'stock_transfers',
      operation: 'UPDATE',
      data: {
        _local_id: transfer._local_id || transfer.id,
        status: 'APPROVED',
        approved_by: approvedBy,
        approved_at: nowIso,
      },
    }));

    (await localMutate({
      table: 'transfer_events',
      operation: 'INSERT',
      data: {
        id: uuidv4(),
        transfer_id: transfer.id,
        organization_id: organizationId,
        event_type: 'APPROVED',
        from_status: transfer.status,
        to_status: 'APPROVED',
        performed_by: approvedBy,
        notes: `Transfer approved by ${approvedBy}`,
      },
    }));

    // Auto-allocate batches upon approval if FEFO is configured
    if (policy.requireFefoAllocation) {
      try {
        const allocate = () => TransferAllocationService.allocateTransfer({
          transferId: transfer.id,
          organizationId,
          allocatedBy: approvedBy,
        });
        if(cloudBusinessMode()) await withPostgresSavepoint(allocate);
        else await allocate();
      } catch (err: any) {
        // If insufficient stock, keep in APPROVED status for manual allocation
      }
    }

    return (await this.getTransferById(transfer.id, organizationId))!;
  }

  /**
   * Reject a transfer request
   */
  static async rejectTransfer(params: {
    transferId: string;
    organizationId: string;
    rejectedBy: string;
    rejectionReason: string;
  }): Promise<StockTransfer> {
    const { transferId, organizationId, rejectedBy, rejectionReason } = params;
    await lockBusinessRows('stock_transfers', [transferId]);

    const transfer: any = (await localDb
      .prepare(
        `SELECT * FROM stock_transfers 
         WHERE (id = ? OR _local_id = ?) AND (organization_id = ?) AND _deleted = 0`
      )
      .get(transferId, transferId, organizationId));

    if (!transfer) throw new Error(`Transfer not found: ${transferId}`);

    if (cloudBusinessMode()) {
      if (transfer.status === 'REJECTED') return (await this.getTransferById(transfer.id, organizationId))!;
      if (!['REQUESTED', 'PENDING_APPROVAL', 'APPROVED', 'ALLOCATING', 'READY_TO_PICK', 'PICKING', 'PICKED', 'PACKED'].includes(transfer.status)) {
        throw new AppError(409, 'A dispatched or completed transfer cannot be rejected here.');
      }
      await TransferAllocationService.releaseTransferAllocations(transfer.id, organizationId);
    }
    const nowIso = new Date().toISOString();
    (await localMutate({
      table: 'stock_transfers',
      operation: 'UPDATE',
      data: {
        _local_id: transfer._local_id || transfer.id,
        status: 'REJECTED',
        rejected_by: rejectedBy,
        rejected_at: nowIso,
        rejection_reason: rejectionReason,
      },
    }));

    (await localMutate({
      table: 'transfer_events',
      operation: 'INSERT',
      data: {
        id: uuidv4(),
        transfer_id: transfer.id,
        organization_id: organizationId,
        event_type: 'REJECTED',
        from_status: transfer.status,
        to_status: 'REJECTED',
        performed_by: rejectedBy,
        notes: `Rejected: ${rejectionReason}`,
      },
    }));

    return (await this.getTransferById(transfer.id, organizationId))!;
  }

  /**
   * Cancel a transfer with stage-aware reservation release
   */
  static async cancelTransfer(params: {
    transferId: string;
    organizationId: string;
    cancelledBy: string;
    cancellationReason?: string;
  }): Promise<StockTransfer> {
    const { transferId, organizationId, cancelledBy, cancellationReason } = params;
    await lockBusinessRows('stock_transfers', [transferId]);

    const transfer: any = (await localDb
      .prepare(
        `SELECT * FROM stock_transfers 
         WHERE (id = ? OR _local_id = ?) AND (organization_id = ?) AND _deleted = 0`
      )
      .get(transferId, transferId, organizationId));

    if (!transfer) throw new Error(`Transfer not found: ${transferId}`);

    if (transfer.status === 'DISPATCHED' || transfer.status === 'IN_TRANSIT' || transfer.status === 'RECEIVED' || transfer.status === 'CLOSED') {
      throw new Error(`Cannot directly cancel transfer in ${transfer.status} status. Please use Return to Source transfer workflow.`);
    }

    if (cloudBusinessMode()) {
      if (transfer.status === 'CANCELLED') return (await this.getTransferById(transfer.id, organizationId))!;
      if (!['DRAFT','REQUESTED','PENDING_APPROVAL','APPROVED','ALLOCATING','READY_TO_PICK','PICKING','PICKED','PACKED'].includes(transfer.status)) {
        throw new AppError(409, 'This transfer can no longer be cancelled.');
      }
    }

    // Release reservations and batch allocations if allocated or picked
    (await TransferAllocationService.releaseTransferAllocations(transfer.id, organizationId));

    const nowIso = new Date().toISOString();
    (await localMutate({
      table: 'stock_transfers',
      operation: 'UPDATE',
      data: {
        _local_id: transfer._local_id || transfer.id,
        status: 'CANCELLED',
        cancelled_by: cancelledBy,
        cancelled_at: nowIso,
        cancellation_reason: cancellationReason || 'Cancelled by user',
      },
    }));

    (await localMutate({
      table: 'transfer_events',
      operation: 'INSERT',
      data: {
        id: uuidv4(),
        transfer_id: transfer.id,
        organization_id: organizationId,
        event_type: 'CANCELLED',
        from_status: transfer.status,
        to_status: 'CANCELLED',
        performed_by: cancelledBy,
        notes: `Cancelled: ${cancellationReason || 'User cancellation'}`,
      },
    }));

    return (await this.getTransferById(transfer.id, organizationId))!;
  }

  /**
   * Create an explicit Return Transfer if destination rejects shipment
   */
  static async createReturnTransfer(params: {
    originalTransferId: string;
    organizationId: string;
    reason: string;
    returnedBy: string;
    lines?: Array<{ medicineId: string; batchId: string; quantity: number }>;
  }): Promise<StockTransfer> {
    const { originalTransferId, organizationId, reason, returnedBy, lines } = params;

    const orig: any = (await localDb
      .prepare(
        `SELECT * FROM stock_transfers WHERE (id = ? OR _local_id = ?) AND (organization_id = ?)`
      )
      .get(originalTransferId, originalTransferId, organizationId));

    if (!orig) throw new Error(`Original transfer not found: ${originalTransferId}`);

    // Return flips source and destination
    return (await this.createTransfer({
      organizationId,
      transferType: 'RETURN_TO_SOURCE',
      sourceLocationType: orig.destination_location_type,
      sourceLocationId: orig.destination_location_id,
      destinationLocationType: orig.source_location_type,
      destinationLocationId: orig.source_location_id,
      priority: 'HIGH',
      reason: 'MANUAL',
      requestedBy: returnedBy,
      notes: `Return against ${orig.transfer_number}. Reason: ${reason}`,
      items: lines
        ? lines.map((l) => ({
            medicineId: l.medicineId,
            requestedQuantity: l.quantity,
          }))
        : (await localDb
            .prepare('SELECT medicine_id, requested_quantity FROM stock_transfer_items WHERE transfer_id = ?')
            .all(orig.id))
            .map((i: any) => ({
              medicineId: i.medicine_id,
              requestedQuantity: Number(i.requested_quantity),
            })),
    }));
  }

  /**
   * Get single transfer by ID with all populated details
   */
  static async getTransferById(id: string, organizationId: string): Promise<StockTransfer | null> {
    const row: any = (await localDb
      .prepare(
        `SELECT * FROM stock_transfers 
         WHERE (id = ? OR _local_id = ?) AND (organization_id = ?) AND _deleted = 0`
      )
      .get(id, id, organizationId));

    if (!row) return null;

    const items: any[] = (await localDb
      .prepare('SELECT * FROM stock_transfer_items WHERE transfer_id = ? AND _deleted = 0')
      .all(row.id));

    const allocations: any[] = (await localDb
      .prepare('SELECT * FROM stock_transfer_batch_allocations WHERE transfer_id = ? AND _deleted = 0')
      .all(row.id));

    const packages: any[] = (await localDb
      .prepare('SELECT * FROM transfer_packages WHERE transfer_id = ? AND _deleted = 0')
      .all(row.id));

    const receipts: any[] = (await localDb
      .prepare('SELECT * FROM transfer_receipts WHERE transfer_id = ? AND _deleted = 0')
      .all(row.id));

    const variances: any[] = (await localDb
      .prepare('SELECT * FROM transfer_variances WHERE transfer_id = ? AND _deleted = 0')
      .all(row.id));

    const events: any[] = (await localDb
      .prepare('SELECT * FROM transfer_events WHERE transfer_id = ? ORDER BY created_at ASC')
      .all(row.id));

    return {
      ...row,
      total_items: Number(row.total_items || 0),
      total_quantity_requested: Number(row.total_quantity_requested || 0),
      total_quantity_dispatched: Number(row.total_quantity_dispatched || 0),
      total_quantity_received: Number(row.total_quantity_received || 0),
      total_value_paise: Number(row.total_value_paise || 0),
      package_count: Number(row.package_count || 0),
      is_cold_chain: Boolean(row.is_cold_chain),
      items: items.map((i) => ({
        ...i,
        conversion_factor: Number(i.conversion_factor || 1),
        requested_quantity: Number(i.requested_quantity || 0),
        base_quantity_requested: Number(i.base_quantity_requested || 0),
        allocated_quantity: Number(i.allocated_quantity || 0),
        picked_quantity: Number(i.picked_quantity || 0),
        dispatched_quantity: Number(i.dispatched_quantity || 0),
        received_quantity: Number(i.received_quantity || 0),
        damaged_quantity: Number(i.damaged_quantity || 0),
        short_quantity: Number(i.short_quantity || 0),
        excess_quantity: Number(i.excess_quantity || 0),
        rejected_quantity: Number(i.rejected_quantity || 0),
        unit_cost_paise: Number(i.unit_cost_paise || 0),
        total_value_paise: Number(i.total_value_paise || 0),
      })),
      allocations: allocations.map((a) => ({
        ...a,
        quantity_allocated: Number(a.quantity_allocated || 0),
        quantity_picked: Number(a.quantity_picked || 0),
        quantity_dispatched: Number(a.quantity_dispatched || 0),
        quantity_received: Number(a.quantity_received || 0),
        quantity_damaged: Number(a.quantity_damaged || 0),
        quantity_short: Number(a.quantity_short || 0),
        quantity_excess: Number(a.quantity_excess || 0),
        unit_cost_paise: Number(a.unit_cost_paise || 0),
        mrp_paise: Number(a.mrp_paise || 0),
        is_picked: Boolean(a.is_picked),
      })),
      packages: packages.map((p) => ({
        ...p,
        is_cold_chain: Boolean(p.is_cold_chain),
        package_number: Number(p.package_number || 1),
      })),
      receipts,
      variances: variances.map((v) => ({
        ...v,
        expected_quantity: Number(v.expected_quantity),
        actual_quantity: Number(v.actual_quantity),
        variance_quantity: Number(v.variance_quantity),
        unit_cost_paise: Number(v.unit_cost_paise),
        variance_value_paise: Number(v.variance_value_paise),
      })),
      events,
    };
  }

  /**
   * List paginated transfers with filters
   */
  static async listTransfers(params: {
    organizationId: string;
    status?: string;
    transferType?: string;
    priority?: string;
    sourceLocationId?: string;
    destinationLocationId?: string;
    search?: string;
    participantIds?: string[];
    page?: number;
    limit?: number;
  }): Promise<{ data: StockTransfer[]; total: number }> {
    const {
      organizationId,
      status,
      transferType,
      priority,
      sourceLocationId,
      destinationLocationId,
      search,
      participantIds,
      page = 1,
      limit = 50,
    } = params;

    let whereClause = `WHERE (organization_id = ?) AND _deleted = 0`;
    const args: any[] = [organizationId];

    if (participantIds) {
      if (!participantIds.length) return { data: [], total: 0 };
      const marks = participantIds.map(() => '?').join(',');
      whereClause += ` AND ((source_location_type='STORE' AND source_location_id IN (${marks}))
        OR (destination_location_type='STORE' AND destination_location_id IN (${marks})))`;
      args.push(...participantIds, ...participantIds);
    }

    if (status) {
      whereClause += ` AND status = ?`;
      args.push(status);
    }
    if (transferType) {
      whereClause += ` AND transfer_type = ?`;
      args.push(transferType);
    }
    if (priority) {
      whereClause += ` AND priority = ?`;
      args.push(priority);
    }
    if (sourceLocationId) {
      whereClause += ` AND (source_location_id = ? OR source_location_id = ?)`;
      args.push(sourceLocationId, sourceLocationId);
    }
    if (destinationLocationId) {
      whereClause += ` AND (destination_location_id = ? OR destination_location_id = ?)`;
      args.push(destinationLocationId, destinationLocationId);
    }
    if (search && search.trim()) {
      whereClause += ` AND (transfer_number LIKE ? OR source_name LIKE ? OR destination_name LIKE ?)`;
      const term = `%${search.trim()}%`;
      args.push(term, term, term);
    }

    const countRow: any = (await localDb
      .prepare(`SELECT COUNT(*) as total FROM stock_transfers ${whereClause}`)
      .get(...args));

    const offset = (page - 1) * limit;
    const rows: any[] = (await localDb
      .prepare(`SELECT * FROM stock_transfers ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...args, limit, offset));

    return {
      data: (await Promise.all(rows.map(async (r) => (await this.getTransferById(r.id, organizationId))!))),
      total: Number(countRow?.total || 0),
    };
  }
}
