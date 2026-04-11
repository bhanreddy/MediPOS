# Medical POS — Go-live runbook

Execute in order. Adapt hostnames and tooling to your environment.

## T-7 days

- [ ] Phase 6 security checklist signed off
- [ ] Load tests passed on staging (p95 &lt; 500 ms at 50 concurrent users)
- [ ] WhatsApp templates approved by Meta (submit 7+ days ahead)
- [ ] Razorpay production mode active, webhook verified
- [ ] EAS production build tested on multiple physical Android devices
- [ ] QA checklist (`docs/QA_CHECKLIST.md`) signed off on staging
- [ ] Disaster recovery runbook shared with team
- [ ] Sentry DSN in production backend, mobile, and web
- [ ] Uptime monitors active

## T-3 days

- [ ] Production Supabase on appropriate plan with PITR if required
- [ ] Test PITR restore once
- [ ] Production env vars set on backend host (verify every variable)
- [ ] DNS and SSL verified for API and web
- [ ] EAS production keystore backed up securely (password manager + encrypted backup)
- [ ] Pilot clinic onboarded in production — end-to-end test

## T-1 day

- [ ] `npm audit` in backend, mobile, web — no critical issues unaddressed
- [ ] `tsc --noEmit` clean where applicable
- [ ] Supabase cron / edge schedules verified
- [ ] Concurrent billing stress test on staging or clone
- [ ] Manual deploy mode if desired for launch window
- [ ] Pilot notified of go-live window

## Launch day (T+0)

- [ ] Deploy backend; verify `/api/health`
- [ ] Deploy web; verify login and dashboard
- [ ] Distribute production app (link or store)
- [ ] Pilot first real sale → verify DB and WhatsApp invoice
- [ ] Monitor errors and host metrics through the day
- [ ] End-of-day: alerts and scheduled jobs verified

## T+7 days

- [ ] Review error telemetry and fix P1/P2 issues
- [ ] Review host metrics (memory, CPU)
- [ ] Compare load-test assumptions to real traffic
- [ ] Pilot feedback captured
- [ ] Plan OTA / patch release if needed
