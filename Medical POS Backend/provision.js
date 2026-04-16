const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const CLINIC_ID = 'c1000000-0000-0000-0000-000000000001';
const USER_ID = '37ad8e02-2675-4cf1-b4d6-9f7e395b5fa8';
const EMAIL = '25e001.nexsyrus@gmail.com';

async function main() {
  // Use pooler transaction-mode connection
  const sql = postgres('postgresql://postgres.mlbdrcdsalbrpcwyidqw:Test%4012345@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require', {
    connect_timeout: 30,
  });
  const client = null; // not used

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!');

    // Step 1: Read and run schema.sql (skip pg_cron extension which may not be available)
    console.log('\n--- Step 1: Creating tables ---');
    let schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    // Remove pg_cron extension (not available on all plans)
    schema = schema.replace(/CREATE EXTENSION IF NOT EXISTS "pg_cron".*?;/g, '-- pg_cron skipped');
    
    // Split into individual statements and run them
    const statements = schema.split(/;\s*$/m).filter(s => s.trim());
    let success = 0, skipped = 0;
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed || trimmed.startsWith('--')) { skipped++; continue; }
      try {
        await client.query(trimmed);
        success++;
      } catch (e) {
        if (e.message.includes('already exists') || e.message.includes('duplicate')) {
          skipped++;
        } else {
          console.log(`  WARN: ${e.message.substring(0, 120)}`);
          skipped++;
        }
      }
    }
    console.log(`  Done: ${success} executed, ${skipped} skipped`);

    // Step 2: Create clinic
    console.log('\n--- Step 2: Creating clinic ---');
    try {
      await client.query(`
        INSERT INTO clinics (id, name, slug, address, phone, email, gstin, drug_licence_number, plan, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'trial', true)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      `, [CLINIC_ID, 'Medical Shop 1', 'medical-shop-1', '3/2 Ashanpally maddur, Telangana 509407', '9347556547', EMAIL, '123BAN123CB', '123456897654']);
      console.log('  Clinic created');
    } catch (e) { console.log('  Clinic:', e.message); }

    // Step 3: Create user row
    console.log('\n--- Step 3: Creating user ---');
    try {
      await client.query(`
        INSERT INTO users (id, clinic_id, full_name, phone, role, is_active)
        VALUES ($1, $2, $3, $4, 'OWNER', true)
        ON CONFLICT (id) DO UPDATE SET clinic_id = EXCLUDED.clinic_id, role = 'OWNER'
      `, [USER_ID, CLINIC_ID, 'Default', '9347556547']);
      console.log('  User created');
    } catch (e) { console.log('  User:', e.message); }

    // Step 4: Create trial subscription
    console.log('\n--- Step 4: Creating trial subscription ---');
    try {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      await client.query(`
        INSERT INTO clinic_subscriptions (clinic_id, plan_name, status, billing_cycle, trial_end)
        VALUES ($1, 'trial', 'trial', 'monthly', $2)
        ON CONFLICT DO NOTHING
      `, [CLINIC_ID, trialEnd.toISOString()]);
      console.log('  Trial subscription created');
    } catch (e) { console.log('  Subscription:', e.message); }

    // Step 5: Set medical_profile verified = true
    console.log('\n--- Step 5: Setting medical_profile verified ---');
    try {
      await client.query(`UPDATE medical_profile SET verified = true WHERE id = $1`, [USER_ID]);
      console.log('  medical_profile verified = true');
    } catch (e) { console.log('  Profile:', e.message); }

    // Verify
    console.log('\n--- Verification ---');
    const { rows: clinics } = await client.query('SELECT id, name, plan FROM clinics LIMIT 3');
    console.log('Clinics:', clinics);
    const { rows: users } = await client.query('SELECT id, clinic_id, role FROM users LIMIT 3');
    console.log('Users:', users);
    const { rows: subs } = await client.query('SELECT clinic_id, plan_name, status FROM clinic_subscriptions LIMIT 3');
    console.log('Subscriptions:', subs);

    console.log('\nProvisioning complete!');
  } catch (e) {
    console.error('Fatal:', e.message);
  } finally {
    await client.end();
  }
}

main();
