import { AppError } from '../lib/appError';
import { queryRaw } from '../lib/postgresDb';
import { cloudBusinessMode, lockBusinessRows } from '../lib/businessDb';
import { listAccessibleCloudStores, selectedCloudStore } from '../services/cloudStoreContext';
// transfers.ts — Enterprise Multi-Store Transfers & Central Replenishment Router
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { StockTransferService } from '../services/transfers/stockTransferService';
import { TransferAllocationService } from '../services/transfers/transferAllocationService';
import { TransferPickPackService } from '../services/transfers/transferPickPackService';
import { TransferDispatchService } from '../services/transfers/transferDispatchService';
import { TransferReceivingService } from '../services/transfers/transferReceivingService';
import { TransferVarianceService } from '../services/transfers/transferVarianceService';
import { InternalReplenishmentEngine } from '../services/transfers/internalReplenishmentEngine';
import { StoreRebalancingEngine } from '../services/transfers/storeRebalancingEngine';
import { ExpiryRedistributionEngine } from '../services/transfers/expiryRedistributionEngine';
import { LocationService } from '../services/transfers/locationService';
import { TransferPolicyService } from '../services/transfers/transferPolicyService';
import { businessDb as localDb } from '../lib/businessDb';

const router = Router();

// Helper to resolve orgId from request
function getOrgId(req: any): string {
  return req.user?.organizationId || req.user?.clinic_id;
}

function hasChainAccess(req: any) {
  return ['OWNER','SUPER_ADMIN'].includes(req.user?.role);
}

async function allowedStores(req: any) {
  if (!cloudBusinessMode()) return undefined;
  const selected = selectedCloudStore();
  if (selected) return [selected];
  if (hasChainAccess(req)) return undefined;
  return (await listAccessibleCloudStores(req.user.clinic_id, { userId: req.user.id, role: req.user.role })).map(store => store.id);
}

// The same transfer may be visible from its source and destination. Each mutation
// checks the grant on the location where its work actually takes place.
router.use(requireAuth, async (req, _res, next) => {
  if (!cloudBusinessMode()) return next();
  try {
    const segments = req.path.split('/').filter(Boolean);
    const [id, action] = segments;
    const isRead = req.method === 'GET';
    if (!id || ['locations','policy','dashboard','variances','replenishment','rebalancing','expiry'].includes(id)) {
      if ((id === 'policy' && !isRead || ['variances','replenishment','rebalancing','expiry'].includes(id)) && !hasChainAccess(req)) {
        throw new AppError(403, 'An owner must perform this operation.');
      }
      return next();
    }
    if (id.length !== 36) return next();
    if (!isRead) await lockBusinessRows('stock_transfers', [id]);
    const [transfer] = await queryRaw(
      'SELECT * FROM stock_transfers WHERE (id::text=? OR _local_id=?) AND organization_id=? AND deleted_at IS NULL',
      [id,id,getOrgId(req)],
    );
    if (!transfer) throw new AppError(404, 'Transfer not found.');
    const check = (side: 'source' | 'destination') => {
      const type = transfer[`${side}_location_type`];
      const location = transfer[`${side}_location_id`];
      if (selectedCloudStore() && type === 'STORE' && location !== selectedCloudStore()) return Promise.resolve(false);
      return LocationService.validateUserAccess(req.user!.id, type, location, getOrgId(req));
    };
    let permitted: boolean;
    if (isRead && action !== 'picklist' || action === 'cancel') {
      permitted = (await check('source')) || (await check('destination'));
    } else {
      permitted = await check(['receive','return'].includes(action) ? 'destination' : 'source');
    }
    if (['approve','reject','cancel','return'].includes(action) && !['OWNER','PHARMACIST','SUPER_ADMIN'].includes(req.user!.role)) permitted = false;
    if (!permitted) throw new AppError(403, 'Access to the appropriate transfer location is required.');
    next();
  } catch (error) { next(error); }
});

// ──────────────────────────────────────────
// 1. TRANSFER LIST & DETAIL
// ──────────────────────────────────────────
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const { status, transferType, priority, sourceLocationId, destinationLocationId, search, page, limit } = req.query;
    const result = (await StockTransferService.listTransfers({
      organizationId: orgId,
      status: status as string,
      transferType: transferType as string,
      priority: priority as string,
      sourceLocationId: sourceLocationId as string,
      destinationLocationId: destinationLocationId as string,
      search: search as string,
      participantIds: await allowedStores(req),
      page: Math.max(1, parseInt(String(page || 1),10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(String(limit || 50),10) || 50)),
    }));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/locations', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const locs = (await LocationService.listLocations(orgId));
    const allowed = cloudBusinessMode() && !hasChainAccess(req)
      ? (await listAccessibleCloudStores(req.user.clinic_id, { userId: req.user.id, role: req.user.role })).map(store => store.id) : undefined;
    res.json(allowed ? locs.filter(location => location.type === 'STORE' && allowed.includes(location.id)) : locs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/policy', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const policy = (await TransferPolicyService.getPolicy(orgId));
    res.json(policy);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/policy', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const updated = (await TransferPolicyService.setPolicy({ ...req.body, organizationId: orgId }));
    res.json(updated);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.get('/dashboard/summary', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const participantIds = await allowedStores(req);
    if (cloudBusinessMode()) {
      const [summary] = await queryRaw(
        `WITH visible AS (
          SELECT id,status FROM stock_transfers WHERE organization_id=? AND deleted_at IS NULL
            AND (?::boolean OR (source_location_type='STORE' AND source_location_id=ANY(?::uuid[]))
               OR (destination_location_type='STORE' AND destination_location_id=ANY(?::uuid[])))
        )
        SELECT count(*) FILTER (WHERE status='REQUESTED')::int AS "requestedCount",
          count(*) FILTER (WHERE status='APPROVED')::int AS "approvedCount",
          count(*) FILTER (WHERE status IN ('READY_TO_PICK','PICKING'))::int AS "readyToPickCount",
          count(*) FILTER (WHERE status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_RECEIVED'))::int AS "inTransitCount",
          (SELECT count(*)::int FROM transfer_variances WHERE status='REPORTED'
            AND deleted_at IS NULL AND transfer_id IN (SELECT id FROM visible)) AS "varianceCount"
        FROM visible`,
        [orgId, !participantIds, participantIds ?? [], participantIds ?? []],
      );
      return res.json(summary);
    }
    const all = await StockTransferService.listTransfers({ organizationId: orgId, limit: 1000 });
    return res.json({
      requestedCount: all.data.filter(t => t.status === 'REQUESTED').length,
      approvedCount: all.data.filter(t => t.status === 'APPROVED').length,
      readyToPickCount: all.data.filter(t => ['READY_TO_PICK','PICKING'].includes(t.status)).length,
      inTransitCount: all.data.filter(t => ['DISPATCHED','IN_TRANSIT'].includes(t.status)).length,
      varianceCount: all.data.reduce((sum, t) => sum + (t.variances?.filter(v => v.status === 'REPORTED').length ?? 0), 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const transfer = (await StockTransferService.getTransferById(req.params.id, orgId));
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    res.json(transfer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────
// 2. LIFECYCLE MUTATIONS
// ──────────────────────────────────────────
router.post('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const transfer = (await StockTransferService.createTransfer({
      ...req.body,
      organizationId: orgId,
      requestedBy: req.user?.id || 'USER',
    }));
    res.status(201).json(transfer);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.post('/:id/approve', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const transfer = (await StockTransferService.approveTransfer({
      transferId: req.params.id,
      organizationId: orgId,
      approvedBy: req.user?.id || 'MANAGER',
      userRole: req.user?.role,
    }));
    res.json(transfer);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.post('/:id/reject', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const transfer = (await StockTransferService.rejectTransfer({
      transferId: req.params.id,
      organizationId: orgId,
      rejectedBy: req.user?.id || 'MANAGER',
      rejectionReason: req.body.reason || 'Rejected by supervisor',
    }));
    res.json(transfer);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.post('/:id/allocate', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const allocs = (await TransferAllocationService.allocateTransfer({
      transferId: req.params.id,
      organizationId: orgId,
      allocatedBy: req.user?.id || 'USER',
      customAllocations: req.body.customAllocations,
    }));
    res.json(allocs);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.get('/:id/picklist', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const pickList = (await TransferPickPackService.generatePickList(req.params.id, orgId));
    res.json(pickList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/pick', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const result = (await TransferPickPackService.recordPick({
      transferId: req.params.id,
      allocationId: req.body.allocationId,
      organizationId: orgId,
      scannedBarcode: req.body.scannedBarcode,
      scannedBatchNumber: req.body.scannedBatchNumber,
      quantityPicked: Number(req.body.quantityPicked),
      pickedBy: req.user?.id || 'PICKER',
    }));
    res.json(result);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.post('/:id/complete-pick', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const result = (await TransferPickPackService.completePicking(req.params.id, orgId, req.user?.id || 'PICKER'));
    res.json(result);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.post('/:id/pack', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const pkg = (await TransferPickPackService.createPackage({
      transferId: req.params.id,
      organizationId: orgId,
      packageType: req.body.packageType,
      isColdChain: req.body.isColdChain,
      items: req.body.items,
      packedBy: req.user?.id || 'PACKER',
      weightKg: req.body.weightKg,
      specialInstructions: req.body.specialInstructions,
    }));
    res.status(201).json(pkg);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.post('/:id/dispatch', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const transfer = (await TransferDispatchService.dispatchTransfer({
      transferId: req.params.id,
      organizationId: orgId,
      dispatchedBy: req.user?.id || 'DISPATCHER',
      carrierName: req.body.carrierName,
      trackingReference: req.body.trackingReference,
      estimatedArrivalAt: req.body.estimatedArrivalAt,
      idempotencyKey: req.body.idempotencyKey,
      notes: req.body.notes,
    }));
    res.json(transfer);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.post('/:id/receive', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const result = (await TransferReceivingService.receiveTransfer({
      transferId: req.params.id,
      organizationId: orgId,
      receivedBy: req.user?.id || 'RECEIVER',
      conditionStatus: req.body.conditionStatus,
      items: req.body.items,
      idempotencyKey: req.body.idempotencyKey,
      notes: req.body.notes,
    }));
    res.json(result);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.post('/:id/cancel', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const transfer = (await StockTransferService.cancelTransfer({
      transferId: req.params.id,
      organizationId: orgId,
      cancelledBy: req.user?.id || 'USER',
      cancellationReason: req.body.reason,
    }));
    res.json(transfer);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.post('/:id/return', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const returnTrf = (await StockTransferService.createReturnTransfer({
      originalTransferId: req.params.id,
      organizationId: orgId,
      reason: req.body.reason || 'Rejected destination delivery',
      returnedBy: req.user?.id || 'RECEIVER',
      lines: req.body.lines,
    }));
    res.status(201).json(returnTrf);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

// ──────────────────────────────────────────
// 3. VARIANCES
// ──────────────────────────────────────────
router.get('/variances/list', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const { transferId, status } = req.query;
    const variances = (await TransferVarianceService.listVariances({
      organizationId: orgId,
      transferId: transferId as string,
      status: status as string,
    }));
    res.json(variances);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/variances/:id/resolve', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const resolved = (await TransferVarianceService.resolveVariance({
      varianceId: req.params.id,
      organizationId: orgId,
      resolution: req.body.resolution,
      resolutionNotes: req.body.resolutionNotes || 'Variance resolved',
      resolvedBy: req.user?.id || 'SUPERVISOR',
      userRole: req.user?.role,
    }));
    res.json(resolved);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

// ──────────────────────────────────────────
// 4. INTELLIGENCE ENGINES
// ──────────────────────────────────────────
router.get('/replenishment/recommendations', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const { storeId, lookbackDays } = req.query;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    const decisions = (await InternalReplenishmentEngine.evaluateStoreReplenishment({
      organizationId: orgId,
      destinationStoreId: storeId as string,
      lookbackDays: lookbackDays ? Number(lookbackDays) : 30,
    }));
    res.json(decisions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/replenishment/generate-transfers', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const transfers = (await InternalReplenishmentEngine.createTransferFromReplenishment({
      organizationId: orgId,
      destinationStoreId: req.body.storeId,
      decisions: req.body.decisions,
      requestedBy: req.user?.id || 'SYSTEM',
    }));
    res.status(201).json(transfers);
  } catch (err: any) {
    res.status(err instanceof AppError ? err.status : 400).json({ error: err.message });
  }
});

router.get('/rebalancing/recommendations', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const recs = (await StoreRebalancingEngine.evaluateRebalancing({ organizationId: orgId }));
    res.json(recs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/expiry/redistributions', requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const plans = (await ExpiryRedistributionEngine.evaluateExpiryRedistribution({ organizationId: orgId }));
    res.json(plans);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
