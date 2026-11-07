import { selectedCloudStore, validateRequestedCloudStore } from '../services/cloudStoreContext';
import { Request, Response, NextFunction } from 'express';
import { businessDb as localDb } from '../lib/businessDb';
import { AppError } from '../lib/appError';

export interface StoreContext {
  organizationId: string;
  storeId: string;
  counterId?: string | null;
  role: string;
  isOrgAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      storeContext?: StoreContext;
    }
  }
}

export interface RequireStoreAccessOptions {
  paramName?: string; // e.g., 'storeId' or 'id'
  allowOrgAdminBypass?: boolean;
}

export function requireStoreAccess(options: RequireStoreAccessOptions = {}) {
  const { paramName = 'store_id', allowOrgAdminBypass = true } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new AppError(401, 'Unauthorized', 'UNAUTHORIZED'));
      }

      const userId = req.user.id;
      const clinicId = req.user.clinic_id;

      // Extract requested storeId from body, params, or query
      const requestedStoreId =
        req.body?.[paramName] ||
        req.params?.[paramName] ||
        (req.query?.[paramName] as string) ||
        selectedCloudStore();

      if (process.env.DATABASE_URL && requestedStoreId && clinicId) {
        await validateRequestedCloudStore(clinicId, { userId, role: req.user.role }, requestedStoreId);
      }

      // 1. Resolve Organization ID
      let organizationId: string | null = null;
      if (clinicId) {
        const clinicRow: any = (await localDb
          .prepare('SELECT organization_id FROM clinics WHERE id = ? OR _local_id = ?')
          .get(clinicId, clinicId));
        organizationId = clinicRow?.organization_id || null;
      }

      // Check User Organization Access
      const uoaRow: any = organizationId
        ? (await localDb
            .prepare(
              'SELECT role, is_active FROM user_organization_access WHERE user_id = ? AND organization_id = ? AND is_active = 1 AND _deleted = 0'
            )
            .get(userId, organizationId))
        : null;

      if (!organizationId) return next(new AppError(403, 'No organization assigned to this account', 'ORGANIZATION_NOT_ASSIGNED'));
      const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
      const isOrgOwner =
        req.user.role === 'OWNER' ||
        uoaRow?.role === 'OWNER' ||
        uoaRow?.role === 'REGIONAL_MANAGER';

      // 2. If no store requested, resolve default store
      let targetStoreId = requestedStoreId;
      let counterId: string | null = null;
      let userStoreRole = req.user.role;

      if (!targetStoreId) {
        // Fetch default store from user_store_access
        const defaultAccess: any = (await localDb
          .prepare(
            'SELECT store_id, counter_id, role FROM user_store_access WHERE user_id = ? AND organization_id = ? AND is_active = 1 AND _deleted = 0 ORDER BY is_default DESC LIMIT 1'
          )
          .get(userId, organizationId));

        if (defaultAccess) {
          targetStoreId = defaultAccess.store_id;
          counterId = defaultAccess.counter_id;
          userStoreRole = defaultAccess.role;
        } else if (clinicId) {
          // Fallback to clinic default store
          const storeRow: any = (await localDb
            .prepare('SELECT id FROM stores WHERE organization_id = ? AND _deleted = 0 LIMIT 1')
            .get(organizationId));
          if (storeRow) {
            targetStoreId = storeRow.id;
          }
        }
      }

      if (!targetStoreId) {
        return next(new AppError(400, 'Store context could not be resolved', 'STORE_REQUIRED'));
      }

      // An owner bypasses individual store grants only inside the resolved organization.
      const store = (await localDb.prepare('SELECT id FROM stores WHERE (id = ? OR _local_id = ?) AND organization_id = ? AND _deleted = 0')
        .get(targetStoreId, targetStoreId, organizationId)) as { id: string } | undefined;
      if (!store) return next(new AppError(403, 'Store access denied', 'FORBIDDEN_STORE_ACCESS'));
      targetStoreId = store.id;

      // 3. Verify user access to the specific store
      if (isSuperAdmin || (isOrgOwner && allowOrgAdminBypass)) {
        // Full org-wide access
        req.storeContext = {
          organizationId,
          storeId: targetStoreId,
          counterId,
          role: userStoreRole,
          isOrgAdmin: true,
        };
        return next();
      }

      // Check specific store access grant
      const storeAccessRow: any = (await localDb
        .prepare(
          'SELECT role, counter_id, is_active FROM user_store_access WHERE user_id = ? AND store_id = ? AND organization_id = ? AND _deleted = 0'
        )
        .get(userId, targetStoreId, organizationId));

      if (!storeAccessRow || storeAccessRow.is_active !== 1) {
        return next(
          new AppError(
            403,
            `Access denied to store: ${targetStoreId}`,
            'FORBIDDEN_STORE_ACCESS'
          )
        );
      }

      req.storeContext = {
        organizationId,
        storeId: targetStoreId,
        counterId: storeAccessRow.counter_id || counterId,
        role: storeAccessRow.role || userStoreRole,
        isOrgAdmin: false,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
