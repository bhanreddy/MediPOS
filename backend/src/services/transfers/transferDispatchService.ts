import { createHash } from 'node:crypto';
import { AppError } from '../../lib/appError';
// transferDispatchService.ts — Transfer Dispatch & In-Transit Stock Movement Engine
import { businessDb as localDb, cloudBusinessMode, lockBusinessRows } from '../../lib/businessDb';
import { localMutate } from '../../lib/localMutate';
import { v4 as uuidv4 } from 'uuid';
import { StockTransfer } from '../../domain/transferTypes';
import { InventoryPositionService } from '../inventoryPosition';
import { InventoryReservationService } from '../inventory/inventoryReservationService';
import { LocationService } from './locationService';

export class TransferDispatchService {
  /**
   * Authoritative Transfer Dispatch:
   * 1. Consumes source reservation
   * 2. Decrements source on_hand
   * 3. Increments in_transit position (visible org-wide)
   * 4. Writes immutable stock_ledger entry: TRANSFER_OUT
   * 5. Destination stock remains UNCHANGED
   */
  static async dispatchTransfer(params: {
    transferId: string;
    organizationId: string;
    dispatchedBy: string;
    carrierName?: string;
    trackingReference?: string;
    estimatedArrivalAt?: string;
    idempotencyKey?: string;
    notes?: string;
  }): Promise<StockTransfer> {
    const {
      transferId,
      organizationId,
      dispatchedBy,
      carrierName,
      trackingReference,
      estimatedArrivalAt,
      idempotencyKey,
      notes,
    } = params;

    await lockBusinessRows('stock_transfers',[transferId]);
    const transfer: any = (await localDb
      .prepare(
        `SELECT * FROM stock_transfers 
         WHERE (id = ? OR _local_id = ?) AND (organization_id = ?) AND _deleted = 0`
      )
      .get(transferId, transferId, organizationId));

    if (!transfer) throw new Error(`Stock transfer not found: ${transferId}`);

    const hasSourceAccess = await LocationService.validateUserAccess(
      dispatchedBy, transfer.source_location_type, transfer.source_location_id, organizationId,
    );
    if (!hasSourceAccess) throw new AppError(403, 'Access to the transfer source is required.');
    const cloud = cloudBusinessMode();
    const fingerprint = createHash('sha256').update(JSON.stringify({
      dispatchedBy, carrierName, trackingReference, estimatedArrivalAt, notes,
    })).digest('hex');
    if (idempotencyKey && (cloud ? transfer.dispatch_request_id : transfer.idempotency_key) === idempotencyKey) {
      if (cloud && transfer.dispatch_request_hash !== fingerprint) throw new AppError(409, 'Dispatch identifier was already used for different details.');
      if (cloud || transfer.status === 'DISPATCHED') return transfer;
    }
    if (!['PACKED', 'PICKED', 'READY_TO_PICK', 'APPROVED'].includes(transfer.status)) {
      throw new AppError(409, `Cannot dispatch transfer in status: ${transfer.status}`);
    }

    // Fetch batch allocations
    const allocs: any[] = (await localDb
      .prepare(
        `SELECT * FROM stock_transfer_batch_allocations WHERE transfer_id = ? AND _deleted = 0`
      )
      .all(transfer.id));

    if (allocs.length === 0) {
      throw new Error('Cannot dispatch transfer with no batch allocations');
    }

    await lockBusinessRows('medicine_batches', allocs.map(allocation => allocation.batch_id));
    const nowIso = new Date().toISOString();
    const sourceStoreId = transfer.source_location_type === 'STORE' ? transfer.source_location_id : null;
    const sourceWarehouseId = transfer.source_location_type === 'WAREHOUSE' ? transfer.source_location_id : null;

    let totalDispatchedQuantity = 0;
    let totalValuePaise = 0;

    const isRecalled = transfer.stock_state_transferred === 'RECALLED';
    const isQuarantined = transfer.stock_state_transferred === 'QUARANTINED';
    const isDamaged = transfer.stock_state_transferred === 'DAMAGED';

    for (const alloc of allocs) {
      const qty = Number(alloc.quantity_picked > 0 ? alloc.quantity_picked : alloc.quantity_allocated);
      if (qty <= 0) continue;

      // 1. Consume / release source reservation if active
      if (alloc.reservation_id) {
        try {
          await InventoryReservationService.consumeReservation(alloc.reservation_id);
        } catch (error) {
          if (cloud) throw error;
          // Fallback manual reserved delta decrement
          (await InventoryPositionService.updateStateQuantities({
            organizationId,
            medicineId: alloc.medicine_id,
            batchId: alloc.batch_id,
            locationType: transfer.source_location_type,
            storeId: sourceStoreId,
            warehouseId: sourceWarehouseId,
            reservedDelta: -qty,
          }));
        }
      }

      // 2. Decrement physical on-hand at source location
      const sourcePosition = await InventoryPositionService.adjustStock({
        organizationId,
        medicineId: alloc.medicine_id,
        batchId: alloc.batch_id,
        locationType: transfer.source_location_type,
        storeId: sourceStoreId,
        warehouseId: sourceWarehouseId,
        quantityDelta: -qty,
      });

      // If stock was recalled, quarantined, or damaged, reduce that specific sub-state
      if (isRecalled) {
        (await InventoryPositionService.updateStateQuantities({
          organizationId,
          medicineId: alloc.medicine_id,
          batchId: alloc.batch_id,
          locationType: transfer.source_location_type,
          storeId: sourceStoreId,
          warehouseId: sourceWarehouseId,
          recalledDelta: -qty,
        }));
      } else if (isQuarantined) {
        (await InventoryPositionService.updateStateQuantities({
          organizationId,
          medicineId: alloc.medicine_id,
          batchId: alloc.batch_id,
          locationType: transfer.source_location_type,
          storeId: sourceStoreId,
          warehouseId: sourceWarehouseId,
          quarantinedDelta: -qty,
        }));
      } else if (isDamaged) {
        (await InventoryPositionService.updateStateQuantities({
          organizationId,
          medicineId: alloc.medicine_id,
          batchId: alloc.batch_id,
          locationType: transfer.source_location_type,
          storeId: sourceStoreId,
          warehouseId: sourceWarehouseId,
          damagedDelta: -qty,
        }));
      }

      // 3. Increment in-transit inventory position (visible across organization)
      (await InventoryPositionService.updateStateQuantities({
        organizationId,
        medicineId: alloc.medicine_id,
        batchId: alloc.batch_id,
        locationType: transfer.source_location_type,
        storeId: sourceStoreId,
        warehouseId: sourceWarehouseId,
        inTransitDelta: qty,
      }));

      // 4. Record immutable stock ledger entry: TRANSFER_OUT
      const ledgerId = uuidv4();
      (await localMutate({
        table: 'stock_ledger',
        operation: 'INSERT',
        data: {
          id: ledgerId,
          _local_id: ledgerId,
          organization_id: organizationId,
          medicine_id: alloc.medicine_id,
          batch_id: alloc.batch_id,
          location_type: transfer.source_location_type,
          store_id: sourceStoreId,
          warehouse_id: sourceWarehouseId,
          movement_type: 'TRANSFER_OUT',
          quantity_delta: -qty,
          balance_after: sourcePosition.quantity_on_hand,
          reference_id: transfer.id,
          reference_type: 'TRANSFER',
          cost_per_unit: (alloc.unit_cost_paise || 0) / 100,
          unit_cost_paise: alloc.unit_cost_paise || 0,
          notes: `Transfer Out to ${transfer.destination_name || transfer.destination_location_id} (Ref: ${transfer.transfer_number})`,
          created_by: dispatchedBy,
          created_at: nowIso,
        },
      }));

      // 5. Update batch allocation record with dispatched qty
      (await localMutate({
        table: 'stock_transfer_batch_allocations',
        operation: 'UPDATE',
        data: {
          _local_id: alloc._local_id || alloc.id,
          quantity_dispatched: qty,
        },
      }));

      totalDispatchedQuantity += qty;
      totalValuePaise += qty * (alloc.unit_cost_paise || 0);
    }

    // Update transfer item dispatched quantities
    for (const alloc of allocs) {
      (await localDb
        .prepare(
          `UPDATE stock_transfer_items 
           SET dispatched_quantity = (SELECT SUM(quantity_dispatched) FROM stock_transfer_batch_allocations WHERE transfer_item_id = ?)
           WHERE id = ?`
        )
        .run(alloc.transfer_item_id, alloc.transfer_item_id));
    }

    // 6. Update transfer document status to DISPATCHED
    const updatedTransfer = (await localMutate({
      table: 'stock_transfers',
      operation: 'UPDATE',
      data: {
        _local_id: transfer._local_id || transfer.id,
        status: 'DISPATCHED',
        dispatched_by: dispatchedBy,
        dispatched_at: nowIso,
        carrier_name: carrierName || null,
        tracking_reference: trackingReference || null,
        estimated_arrival_at: estimatedArrivalAt || null,
        ...(cloud ? { dispatch_request_id: idempotencyKey || null, dispatch_request_hash: fingerprint }
          : { idempotency_key: idempotencyKey || null }),
        total_quantity_dispatched: totalDispatchedQuantity,
        total_value_paise: totalValuePaise,
        notes: notes || transfer.notes,
      },
    }));

    // 7. Write immutable event log
    (await localMutate({
      table: 'transfer_events',
      operation: 'INSERT',
      data: {
        id: uuidv4(),
        transfer_id: transfer.id,
        organization_id: organizationId,
        event_type: 'DISPATCHED',
        from_status: transfer.status,
        to_status: 'DISPATCHED',
        performed_by: dispatchedBy,
        notes: `Dispatched ${totalDispatchedQuantity} units in transit. Carrier: ${carrierName || 'Internal Fleet'}`,
      },
    }));

    return updatedTransfer as any;
  }
}
