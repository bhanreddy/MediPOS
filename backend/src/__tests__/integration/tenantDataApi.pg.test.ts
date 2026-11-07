import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const database = process.env.TEST_DATABASE_URL;
if (database) {
  const url = new URL(database);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_qa'))
    throw new Error('Tenant privilege tests require a disposable local *_qa database');
}
const sql = postgres(database || 'postgres://127.0.0.1:1/medical_unconfigured_qa', { max: 1 });
const migration = fs.readFileSync(path.join(__dirname, '../../../migrations/029_api_only_tenant_data.sql'), 'utf8');
const storageMigration = fs.readFileSync(path.join(__dirname, '../../../migrations/030_private_purchase_bills.sql'), 'utf8');

(database ? describe : describe.skip)('PostgreSQL browser tenant boundary', () => {
  beforeAll(async () => {
    await sql.unsafe(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE tenant_boundary_qa(id serial PRIMARY KEY, clinic_id text, secret text);
      INSERT INTO tenant_boundary_qa(clinic_id,secret) VALUES('a','tenant-a-secret'),('b','tenant-b-secret');
      ALTER TABLE tenant_boundary_qa ENABLE ROW LEVEL SECURITY;
      CREATE POLICY legacy_allow_all ON tenant_boundary_qa FOR ALL USING(true) WITH CHECK(true);
      CREATE VIEW tenant_boundary_view_qa AS SELECT * FROM tenant_boundary_qa;
      CREATE MATERIALIZED VIEW tenant_boundary_summary_qa AS SELECT * FROM tenant_boundary_qa;
      CREATE FUNCTION tenant_boundary_rpc_qa() RETURNS SETOF tenant_boundary_qa LANGUAGE sql SECURITY DEFINER
        AS 'SELECT * FROM tenant_boundary_qa';
      GRANT ALL ON tenant_boundary_qa,tenant_boundary_view_qa,tenant_boundary_summary_qa TO PUBLIC,anon,authenticated;
      GRANT ALL ON SEQUENCE tenant_boundary_qa_id_seq TO PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION tenant_boundary_rpc_qa() TO PUBLIC,anon,authenticated;`);
    await sql.unsafe(migration);
    await sql.unsafe(migration);
    await sql.unsafe(`CREATE SCHEMA storage;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean);
      INSERT INTO storage.buckets VALUES('purchase-bills',true),('posters',true);
      CREATE TABLE storage.objects(bucket_id text, name text);
      INSERT INTO storage.objects VALUES('purchase-bills','a/private.jpg'),('posters','public.jpg');
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE POLICY legacy_storage_allow_all ON storage.objects FOR ALL USING(true) WITH CHECK(true);
      GRANT ALL ON storage.objects TO PUBLIC;`);
    await sql.unsafe(storageMigration);
    await sql.unsafe(storageMigration);
  });
  afterAll(async () => { await sql.end(); });

  test.each(['anon', 'authenticated'])('%s cannot bypass the API through tables, views, summaries, RPCs, or sequences', async role => {
    for (const query of [
      'SELECT * FROM tenant_boundary_qa', 'SELECT * FROM tenant_boundary_view_qa',
      'SELECT * FROM tenant_boundary_summary_qa', 'SELECT * FROM tenant_boundary_rpc_qa()',
      "SELECT nextval('tenant_boundary_qa_id_seq')",
      "INSERT INTO tenant_boundary_qa(clinic_id,secret) VALUES('a','intruder')",
      "UPDATE tenant_boundary_qa SET secret='intruder'", 'DELETE FROM tenant_boundary_qa',
    ]) {
      await expect(sql.begin(async tx => {
        await tx.unsafe(`SET LOCAL ROLE ${role}`);
        await tx.unsafe(query);
      })).rejects.toThrow('permission denied');
    }
  });

  test('the trusted service role retains API access', async () => {
    await sql.begin(async tx => {
      await tx.unsafe('SET LOCAL ROLE service_role');
      expect((await tx`SELECT * FROM tenant_boundary_qa`).length).toBe(2);
      expect((await tx`SELECT * FROM tenant_boundary_rpc_qa()`).length).toBe(2);
    });
  });

  test('purchase buckets become private and legacy browser storage policies cannot expose their files', async () => {
    expect((await sql`SELECT public FROM storage.buckets WHERE id='purchase-bills'`)[0].public).toBe(false);
    for (const role of ['anon','authenticated']) {
      await sql.begin(async tx => {
        await tx.unsafe(`SET LOCAL ROLE ${role}`);
        expect((await tx`SELECT * FROM storage.objects WHERE bucket_id='purchase-bills'`).length).toBe(0);
        expect((await tx`SELECT * FROM storage.objects WHERE bucket_id='posters'`).length).toBe(1);
      });
    }
    await sql.begin(async tx => {
      await tx.unsafe('SET LOCAL ROLE service_role');
      expect((await tx`SELECT * FROM storage.objects WHERE bucket_id='purchase-bills'`).length).toBe(1);
    });
  });

  test('future tables and RPCs default to no browser access', async () => {
    await sql.unsafe(`CREATE TABLE tenant_boundary_future_qa(secret text);
      CREATE FUNCTION tenant_boundary_future_rpc_qa() RETURNS text LANGUAGE sql AS 'SELECT ''private''::text';`);
    for (const role of ['anon', 'authenticated']) {
      const [privileges] = await sql`SELECT has_table_privilege(${role}, 'tenant_boundary_future_qa', 'SELECT') AS can_read,
        has_function_privilege(${role}, 'tenant_boundary_future_rpc_qa()', 'EXECUTE') AS can_call`;
      expect(privileges).toMatchObject({ can_read: false, can_call: false });
    }
  });
});
