import { businessDb as localDb } from '../lib/businessDb';
import { localMutate } from '../lib/localMutate';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../lib/appError';

export type SupervisorActionType =
  | 'HIGH_DISCOUNT'
  | 'PRICE_OVERRIDE'
  | 'NEAR_EXPIRY_SALE'
  | 'RETURN_OVERRIDE'
  | 'SALE_CANCELLATION'
  | 'BATCH_OVERRIDE'
  | 'CREDIT_LIMIT_OVERRIDE';

export interface AuthorizeActionParams {
  organizationId: string;
  storeId: string;
  counterId?: string | null;
  terminalId?: string | null;
  actionType: SupervisorActionType;
  requestingUserId: string;
  supervisorPin?: string;
  supervisorUserId?: string;
  entityType?: string;
  entityId?: string;
  reason: string;
  oldValue?: string;
  newValue?: string;
}

export class SupervisorAuthService {
  /**
   * Validates supervisor credentials and creates an audited authorization record.
   */
  static async authorize(params: AuthorizeActionParams) {
    const {
      organizationId,
      storeId,
      counterId = null,
      terminalId = null,
      actionType,
      requestingUserId,
      supervisorPin,
      supervisorUserId,
      entityType = 'SALE',
      entityId = '',
      reason,
      oldValue = '',
      newValue = '',
    } = params;

    // An ID or a shared default PIN is not proof of another supervisor's identity.
    // Approval uses the signed-in supervisor session and that account's tenant grants.
    if (supervisorPin || (supervisorUserId && supervisorUserId !== requestingUserId)) {
      throw new AppError(403, 'Sign in with a supervisor account to authorize this action', 'SUPERVISOR_AUTH_FAILED');
    }
    const authorizingUser: any = (await localDb.prepare(`SELECT u.* FROM users u
      LEFT JOIN clinics c ON c.id = u.clinic_id OR c._local_id = u.clinic_id
      WHERE (u.id = ? OR u._local_id = ?) AND u.is_active = 1 AND u._deleted = 0
        AND (c.organization_id = ? OR EXISTS (
          SELECT 1 FROM user_organization_access a WHERE a.user_id = u.id
          AND a.organization_id = ? AND a.is_active = 1 AND a._deleted = 0))`)
      .get(requestingUserId, requestingUserId, organizationId, organizationId));

    if (!authorizingUser) {
      throw new AppError(403, 'Invalid supervisor PIN or unauthorized manager credentials', 'SUPERVISOR_AUTH_FAILED');
    }

    const authRole = authorizingUser.role;
    const isAllowedRole = ['OWNER', 'SUPER_ADMIN', 'ORG_ADMIN', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(authRole);

    if (!isAllowedRole) {
      throw new AppError(403, `User ${authorizingUser.full_name} (${authRole}) does not have supervisor authority`, 'SUPERVISOR_ROLE_UNAUTHORIZED');
    }

    const authId = uuidv4();
    const record = (await localMutate({
      table: 'supervisor_authorizations',
      operation: 'INSERT',
      data: {
        id: authId,
        _local_id: authId,
        organization_id: organizationId,
        store_id: storeId,
        counter_id: counterId,
        terminal_id: terminalId,
        action_type: actionType,
        requesting_user_id: requestingUserId,
        authorizing_user_id: authorizingUser.id || authorizingUser._local_id,
        entity_type: entityType,
        entity_id: entityId,
        reason,
        old_value: oldValue,
        new_value: newValue,
        status: 'APPROVED',
      },
    }));

    return {
      authorizationId: authId,
      actionType,
      authorizingUserId: authorizingUser.id || authorizingUser._local_id,
      authorizingUserName: authorizingUser.full_name,
      status: 'APPROVED',
      authorizedAt: new Date().toISOString(),
    };
  }
}
