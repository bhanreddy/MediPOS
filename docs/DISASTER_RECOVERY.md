# Medical POS — Disaster recovery runbook

## Severity levels

- **P0:** Platform completely down, all clinics affected → respond in 15 minutes
- **P1:** Partial outage (one region, one feature) → respond in 1 hour
- **P2:** Performance degraded → respond in 4 hours
- **P3:** Non-critical bug → respond in 24 hours

## P0 response steps

### Scenario A: Backend API completely down

1. Check hosting dashboard (e.g. Railway) → is the service crashed?
2. If yes: roll back to last successful deployment.
3. Check: `GET https://api.yourmedicalpos.com/api/health`
4. If the platform is down: switch DNS to a warm standby if configured.
5. Notify clinics via agreed channel (e.g. WhatsApp broadcast from SUPER_ADMIN).
6. Estimated recovery: 10–15 minutes.

### Scenario B: Supabase database unreachable

1. Check [Supabase status](https://status.supabase.com).
2. If provider incident: communicate ETA to clinics; mobile offline queue continues to protect billing data locally.
3. Estimated recovery: per provider SLA.

### Scenario C: Data corruption / accidental deletion

1. Immediately disable the affected API route (return 503) to stop further writes.
2. Use Supabase Point-in-Time Recovery to restore before the incident.
3. Verify restored data and RLS.
4. Re-enable routes.
5. Estimated recovery: 30–60 minutes.

### Scenario D: Security breach (unauthorized access)

1. Rotate Supabase JWT secret (invalidates sessions).
2. Rotate backend and third-party secrets (Razorpay, WhatsApp, etc.).
3. Audit `audit_logs` for suspicious activity.
4. Notify affected clinics per policy.

## Backup verification (monthly)

- [ ] Restore latest backup to a **test** Supabase project
- [ ] Verify row counts vs production (sample)
- [ ] Run a sample sale query
- [ ] Confirm RLS still enforced
- [ ] Record verifier and date

## Emergency contacts

- Hosting: per your provider support portal
- Supabase: [supabase.com/support](https://supabase.com/support)
- Razorpay: [razorpay.com/support](https://razorpay.com/support)
- WhatsApp (Interakt): [interakt.ai](https://www.interakt.ai/) support
