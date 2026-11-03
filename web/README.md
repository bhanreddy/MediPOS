# MedPOS web workspace

React 19, TypeScript and Vite frontend for the `../backend` API. Authentication uses Supabase; clinic and stock workflows require the API and its database.

## Local development

1. Run `npm ci` in this directory.
2. Copy `.env.example` to `.env.local` and supply the project's public Supabase URL and anon/publishable key. Never place a service-role key in a `VITE_` variable.
3. Start the backend on port 5001 using its `.env.example` configuration.
4. Run `npm run dev` and open `http://127.0.0.1:8082`.

The `/api` development proxy targets port 5001. `VITE_API_URL` overrides it. A bare API origin automatically gets `/api` appended. Production hosting must serve `index.html` for frontend deep links; `vercel.json` supplies that rewrite for Vercel. Set an absolute HTTPS API URL for Vercel builds.

## Checks

```sh
npm run build
npm test
npm run lint
```

The build checks TypeScript and produces split route bundles in `dist/`. Tests cover authentication recovery, API contracts, billing behavior, directory pagination, CSV safety and report completeness. Full lint still has existing violations and is a separate release task; a successful build does not mean it is lint-clean.

See [the current QA report](../docs/qa/production-polish-2026-10-26/REPORT.md) for the route inventory, browser checks, remaining blockers and safe PostgreSQL test setup. Local validation does not certify hosted payment, operational stock integration or device printing.
