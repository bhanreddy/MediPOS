import { randomUUID } from 'node:crypto';
const mockQuery = jest.fn();
jest.mock('../lib/postgresDb', () => ({ queryRaw: (...args: unknown[]) => mockQuery(...args) }));
import { localDb } from '../local-db';
import { ensureCloudPosDirectory } from '../services/cloudPosDirectory';
const admin = randomUUID(), home = randomUUID(), target = randomUUID(), organization = randomUUID();
const original = process.env.DATABASE_URL;
beforeAll(() => {
  process.env.DATABASE_URL = 'postgres://127.0.0.1:1/directory_qa';
  localDb.prepare('INSERT INTO users(id,_local_id,clinic_id,role,_updated_at) VALUES(?,?,?,?,?)').run(admin,admin,home,'SUPER_ADMIN',new Date().toISOString());
});
afterAll(() => { if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original; });
beforeEach(() => mockQuery.mockReset());
test('impersonation does not overwrite the admin clinic or persist access grants', async () => {
  mockQuery.mockResolvedValue([{ id: target, name: 'Target pharmacy', organization_id: organization, is_active: true }]);
  const user = { id: admin, clinic_id: target, role: 'SUPER_ADMIN' as const, email: 'qa@example.invalid', isImpersonating: true };
  expect(await ensureCloudPosDirectory(user)).toBe(organization);
  expect((localDb.prepare('SELECT clinic_id FROM users WHERE id = ?').get(admin) as any).clinic_id).toBe(home);
  expect(localDb.prepare('SELECT id FROM user_organization_access WHERE user_id = ? AND organization_id = ?').get(admin,organization)).toBeUndefined();
  expect(localDb.prepare('SELECT id FROM user_store_access WHERE user_id = ? AND store_id = ?').get(admin,target)).toBeUndefined();
});
test('cloud directory reads revalidate clinic activity instead of trusting a stale mirror', async () => {
  mockQuery.mockResolvedValue([{ id: target, organization_id: organization, is_active: false }]);
  await expect(ensureCloudPosDirectory({ id: admin, clinic_id: target, role: 'SUPER_ADMIN', email: 'qa@example.invalid', isImpersonating: true })).rejects.toThrow('unavailable');
});
