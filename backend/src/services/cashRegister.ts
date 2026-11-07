import { AppError } from '../lib/appError';
import { queryRaw } from '../lib/postgresDb';

export interface RegisterScope {
  clinicId: string;
  storeId: string;
  userId: string;
  role: string;
}

interface RegisterSession {
  id: string;
  opened_by: string;
  opened_at: string;
  opening_paise: string;
  opening_request_id: string;
  closed_at: string | null;
  closing_paise: string | null;
  closing_report: RegisterReport | null;
}

interface RegisterReport {
  kind: 'X' | 'Z';
  session_id: string;
  opened_at: string;
  opened_by: string;
  opening_paise: number;
  cash_sales_paise: number;
  cash_refunds_paise: number;
  cash_in_paise: number;
  cash_out_paise: number;
  drops_paise: number;
  expenses_paise: number;
  expected_paise: number;
  actual_paise: number | null;
  variance_paise: number | null;
  tenders: Array<{ tender_type: string; sales_paise: number; refunds_paise: number }>;
}

export async function activeRegister(scope: RegisterScope, required: boolean, id?: string) {
  const [session] = await queryRaw<RegisterSession>(
    `SELECT * FROM cash_register_sessions
     WHERE clinic_id = ? AND store_id = ? AND opened_by = ? AND closed_at IS NULL
       AND (?::uuid IS NULL OR id = ?::uuid)
     FOR UPDATE`,
    [scope.clinicId, scope.storeId, scope.userId, id ?? null, id ?? null],
  );
  if (!session && (required || id)) {
    throw new AppError(409, 'Open a cash register shift to record this payment.', 'REGISTER_REQUIRED');
  }
  return session;
}

async function getSession(scope: RegisterScope, id: string) {
  const [session] = await queryRaw<RegisterSession>(
    'SELECT * FROM cash_register_sessions WHERE id = ? AND clinic_id = ? AND store_id = ? FOR UPDATE',
    [id, scope.clinicId, scope.storeId],
  );
  if (!session || (session.opened_by !== scope.userId && scope.role !== 'OWNER')) {
    throw new AppError(404, 'Register shift not found.');
  }
  return session;
}

export async function openRegister(scope: RegisterScope, requestId: string, openingPaise: number) {
  await queryRaw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
    `register:${scope.clinicId}:${scope.storeId}:${scope.userId}`,
  ]);
  const [existing] = await queryRaw<RegisterSession>(
    'SELECT * FROM cash_register_sessions WHERE clinic_id = ? AND opening_request_id = ?',
    [scope.clinicId, requestId],
  );
  if (existing) {
    if (existing.opened_by !== scope.userId || Number(existing.opening_paise) !== openingPaise) {
      throw new AppError(409, 'This opening request was already used.');
    }
    return getSession(scope, existing.id);
  }
  if (await activeRegister(scope, false)) throw new AppError(409, 'A register shift is already open.');
  const [session] = await queryRaw<RegisterSession>(
    `INSERT INTO cash_register_sessions (clinic_id, store_id, opened_by, opening_request_id, opening_paise)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
    [scope.clinicId, scope.storeId, scope.userId, requestId, openingPaise],
  );
  return session;
}

async function calculateReport(session: RegisterSession, actualPaise: number | null): Promise<RegisterReport> {
  const tenderRows = await queryRaw(
    `SELECT tender_type, COALESCE(SUM(amount_paise) FILTER (WHERE amount_paise > 0), 0) AS sales_paise,
            COALESCE(-SUM(amount_paise) FILTER (WHERE amount_paise < 0), 0) AS refunds_paise
     FROM payment_transactions WHERE register_session_id = ? AND deleted_at IS NULL
       AND status IN ('COMPLETED', 'REFUNDED')
     GROUP BY tender_type ORDER BY tender_type`, [session.id],
  );
  const tenders = tenderRows.map(row => ({
    tender_type: row.tender_type,
    sales_paise: Number(row.sales_paise),
    refunds_paise: Number(row.refunds_paise),
  }));
  const cash = tenders.find(row => row.tender_type === 'CASH');
  const movements = await queryRaw(
    'SELECT kind, SUM(amount_paise) AS total FROM cash_register_movements WHERE session_id = ? GROUP BY kind',
    [session.id],
  );
  const movement = (kind: string) => Number(movements.find(row => row.kind === kind)?.total ?? 0);
  const opening = Number(session.opening_paise);
  const cashSales = cash?.sales_paise ?? 0;
  const cashRefunds = cash?.refunds_paise ?? 0;
  const expected = opening + cashSales - cashRefunds + movement('CASH_IN')
    - movement('CASH_OUT') - movement('DROP') - movement('EXPENSE');
  return {
    kind: actualPaise === null ? 'X' : 'Z',
    session_id: session.id,
    opened_at: session.opened_at,
    opened_by: session.opened_by,
    opening_paise: opening,
    cash_sales_paise: cashSales,
    cash_refunds_paise: cashRefunds,
    cash_in_paise: movement('CASH_IN'),
    cash_out_paise: movement('CASH_OUT'),
    drops_paise: movement('DROP'),
    expenses_paise: movement('EXPENSE'),
    expected_paise: expected,
    actual_paise: actualPaise,
    variance_paise: actualPaise === null ? null : actualPaise - expected,
    tenders,
  };
}

export async function registerReport(scope: RegisterScope, id: string) {
  const session = await getSession(scope, id);
  const report = session.closing_report ?? await calculateReport(session, null);
  const movements = await queryRaw(
    'SELECT * FROM cash_register_movements WHERE session_id = ? ORDER BY created_at, id', [id],
  );
  return { ...report, closed_at: session.closed_at, movements };
}

export async function closeRegister(scope: RegisterScope, id: string, actualPaise: number) {
  const session = await getSession(scope, id);
  if (session.closed_at) {
    if (Number(session.closing_paise) !== actualPaise) throw new AppError(409, 'Shift was already closed with a different cash count.');
    return session.closing_report;
  }
  const report = await calculateReport(session, actualPaise);
  await queryRaw(
    `UPDATE cash_register_sessions SET closed_at = now(), closed_by = ?, closing_paise = ?,
       closing_report = ?::text::jsonb WHERE id = ?`,
    [scope.userId, actualPaise, JSON.stringify(report), id],
  );
  return report;
}

export async function recordCashMovement(
  scope: RegisterScope, id: string,
  input: { request_id: string; kind: 'CASH_IN' | 'CASH_OUT' | 'DROP' | 'EXPENSE'; amount_paise: number; reason: string },
) {
  const session = await getSession(scope, id);
  const [existing] = await queryRaw(
    'SELECT * FROM cash_register_movements WHERE session_id = ? AND request_id = ?', [id, input.request_id],
  );
  if (existing) {
    if (existing.kind !== input.kind || Number(existing.amount_paise) !== input.amount_paise || existing.reason !== input.reason) {
      throw new AppError(409, 'This movement request was already used.');
    }
    return existing;
  }
  if (session.closed_at) throw new AppError(409, 'Register shift is closed.');
  if (input.kind !== 'CASH_IN' && input.amount_paise > (await calculateReport(session, null)).expected_paise) {
    throw new AppError(409, 'This movement exceeds the expected cash in the drawer.');
  }
  const [movement] = await queryRaw(
    `INSERT INTO cash_register_movements (session_id, request_id, actor_id, kind, amount_paise, reason)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    [id, input.request_id, scope.userId, input.kind, input.amount_paise, input.reason],
  );
  return movement;
}
