const postgres = require('postgres');

const sql = postgres({
  host: 'aws-1-ap-south-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  username: 'postgres.mlbdrcdsalbrpcwyidqw',
  password: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sYmRyY2RzYWxicnBjd3lpZHF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDAzMzE5OSwiZXhwIjoyMDg1NjA5MTk5fQ.JXm6nUw6oMVFedHpnZF3Zv5CjC_3t_dratYu_eEqvnM',
  ssl: 'require',
  connect_timeout: 15,
});

sql`SELECT 1 as test`
  .then(r => { console.log('SUCCESS:', JSON.stringify(r)); return sql.end(); })
  .catch(e => { console.log('FAIL:', e.message); return sql.end(); });
