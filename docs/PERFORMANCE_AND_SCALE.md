# Database performance, pooling, and scale (Phase 9)

## Slow query audit (PostgreSQL)

Run on the database (requires `pg_stat_statements`):

```sql
SELECT
  query,
  calls,
  mean_exec_time,
  total_exec_time,
  rows
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;
```

For each slow query, run `EXPLAIN ANALYZE` and add or adjust indexes.

## Materialized view: `daily_sales_summary`

Created in `Medical POS Backend/migrations/phase_789_features.sql`. Refresh strategy example:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary;
```

Schedule with `pg_cron` when stable (e.g. hourly). Point dashboard aggregates at this view for historical ranges; keep “today” on live `sales` if needed.

## Connection pooling

Use Supabase **transaction mode** (pooler port, typically 6543) for server-side connections so many short-lived API requests do not exhaust direct Postgres connections.

## Multi-region (when justified)

- Prefer read replicas for heavy **GET** report paths before multi-region app servers.
- Measure p95/p99 latency by region; adopt replicas when revenue and clinic count justify cost.

## Verification queries (post go-live)

See project prompt “FINAL VERIFICATION QUERIES” — run regularly to catch negative stock, duplicate invoices, tenant drift, and RLS regressions.
