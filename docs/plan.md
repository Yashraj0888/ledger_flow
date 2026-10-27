# LedgerFlow — Build Plan

Working checklist for the Transaction Ledger API (with per-user login).

**Source of truth:** [full_stack_developer_assessment.md](full_stack_developer_assessment.md)  
**API contract:** [API.md](API.md) — tick boxes there as each endpoint is verified.  
**Features / setup:** [../README.md](../README.md) — keep updated with every feature.

---

## Stack (locked)

| Layer | Choice |
|---|---|
| App | **Next.js 16 (latest)** — App Router, Route Handlers under `app/api/` (Cache Components on; handlers opt out via `connection()`) |
| Language | TypeScript |
| Database | **Supabase** (Postgres), dedicated project `ledgerflow` |
| Validation | Zod |
| DB access | `@supabase/supabase-js` (service role, server only) → SQL functions (RPC) |
| Auth | Own users table; username+password **or** username+MPIN; opaque bearer sessions |
| Hosting | **AWS** (Amplify Hosting for Next.js) |

---

## Decisions / assumptions

- Base URL for API routes: `/api/v1/...`; health at `/health`.
- IDs: UUID v4 (`gen_random_uuid()`).
- Money: `NUMERIC(18,2)`; responses return decimal **strings** (`"100.00"`); all arithmetic in the database.
- **Auth is in scope** (added after the original assessment text):
  - Register with `username`, `password`, `mpin` (4–6 digits). Login with `method: "password" | "mpin"`.
  - Opaque 8-hour session token, only its SHA-256 is stored; logout revokes.
  - Passwords/MPIN: scrypt + server-side pepper (`AUTH_PEPPER`). 5 failed logins → 15 min lock.
- **Isolation:** every account belongs to one user; every ledger function takes the authenticated `user_id`
  and filters by ownership. Foreign account ids answer `404 ACCOUNT_NOT_FOUND` (indistinguishable from missing).
- **Transfers:** source must be yours; destination may be yours or another user's account.
  Foreign destination balances are not returned (`to_balance: null`). Users may credit/debit their own accounts;
  optional env admin can also credit any account.
- `account_id` lives in the URL path for account-scoped routes.
- Duplicate `reference_id` (same account): `409 DUPLICATE_TRANSACTION`, existing tx in details; balance unchanged.
- Insufficient balance: `422 INSUFFICIENT_BALANCE`.
- Pagination: `page` default 1, `limit` default 20, max 100.
- Sort: `created_at DESC`, then `id DESC` (`created_at` = `clock_timestamp()` taken after the account lock).
- `accounts.balance` is the only derived column (assessment requires it); the DB only lets it change via the
  transaction-insert trigger.
- Test data is never deleted (ledger rows are immutable by design).

---

## Layout

```
app/
  api/
    [...path]/route.ts                              # JSON 404 for unknown /api paths
    v1/
      auth/{register,login,logout,me}/route.ts
      accounts/route.ts                             # POST create, GET list own
      accounts/[accountId]/balance/route.ts
      accounts/[accountId]/transactions/route.ts    # POST add, GET history
      accounts/[accountId]/transactions/[transactionId]/route.ts   # PUT/PATCH/DELETE → 405
      transfers/route.ts
  health/route.ts
lib/
  env.ts  errors.ts  http.ts  db.ts  money.ts  pagination.ts  validation.ts
  supabase/server.ts
  auth/{secrets,session}.ts
  services/{auth,ledger}.ts
supabase/migrations/20261027152658_init_ledger.sql
scripts/e2e.mjs                                     # npm run test:e2e
docs/  (API.md, plan.md, assessment)
```

---

## Phase 0 — Project bootstrap

- [x] `create-next-app@latest` (TypeScript, App Router, ESLint, no Tailwind, no `src/`)
- [x] Deps: `@supabase/supabase-js`, `zod`
- [x] `.env.example` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_PEPPER`), `.env.local` gitignored
- [x] `lib/supabase/server.ts` service-role client
- [x] Shared error helper + consistent JSON error responses
- [x] No secrets committed

## Phase 1 — Supabase schema & integrity

- [x] Dedicated Supabase project `ledgerflow` (separate from the other app's project)
- [x] Migration `init_ledger` applied:
  - [x] `users`, `sessions`, `accounts`, `transfers`, `transactions` (3NF, enums, FKs `ON DELETE RESTRICT`)
  - [x] `UNIQUE (account_id, reference_id)`, `amount > 0`, `balance >= 0`, type enum, length/blank checks
  - [x] History index `(account_id, created_at DESC, id DESC)`; one debit + one credit leg per transfer
  - [x] Immutability triggers on `transactions` and `transfers` (UPDATE/DELETE/TRUNCATE)
  - [x] Balance maintained only by `AFTER INSERT` trigger; guard trigger blocks direct balance/owner edits
  - [x] SQL functions with ownership filtering; `FOR UPDATE` locks (both accounts in id order for transfers)
  - [x] RLS enabled on all tables, no policies; execute/table grants revoked from `anon`/`authenticated`
- [x] DB-level test suite run in a rolled-back transaction (walkthrough, rejects, duplicates, isolation,
      immutability, tamper guard, transfers, pagination, lockout, sessions)
- [x] Supabase security advisor: only the intended "RLS enabled, no policy" INFO notices

## Phase 2 — Foundations in Next.js

- [x] Zod schemas (register/login/account/transaction/transfer) with specific error codes
- [x] Money parse helper (2 decimals, rejects invalid), pagination helper
- [x] Central `AppError` + error catalog
- [x] UUID path-param validation → `400 INVALID_ACCOUNT_ID` vs `404 ACCOUNT_NOT_FOUND`
- [x] `route()` wrapper: `connection()` + uniform error mapping

## Phase 3 — APIs (mirror [API.md](API.md) checkboxes)

### 3.0 Auth
- [x] `POST /auth/register`, `POST /auth/login` (password **or** MPIN), `GET /auth/me`, `POST /auth/logout`
- [x] Browser sessions: `lf_session` HttpOnly + SameSite=Strict cookie set on login, cleared on logout
- [x] Verified end-to-end against Supabase

### 3.1 – 3.7 Ledger
- [x] 3.1 Create account · [x] 3.1b List own accounts · [x] 3.1c Get one own account (`GET /accounts/:id`)
- [x] 3.2 Add transaction (credit/debit/insufficient/duplicate/atomic)
- [x] 3.3 Balance · [x] 3.4 History (filter, pagination, latest-first)
- [x] 3.5 Immutability (405 verified over HTTP)
- [x] 3.6 Health · [x] 3.7 Transfer (own accounts, atomic)
- [x] All API.md boxes ticked after `npm run test:e2e` passed against the real database

## Phase 3b — Web UI (App Router, no UI library; `sonner` toasts, `lucide-react` icons)

- [x] `proxy.ts` (Next 16 name for middleware): signed-out visitors always go to `/login`, signed-in users skip
      `/login` and `/register`; session verified in the database; bad cookies cleared; API routes excluded
- [x] Design system in `app/globals.css`: warm light palette (cream, espresso, terracotta, olive, brick), Fraunces +
      DM Sans, flat surfaces, thin scroll-reveal scrollbars, responsive; no dark mode, no gradients
- [x] Registration collects password **and** MPIN; both stored only as scrypt hashes
- [x] `AuthProvider`: restores the session from the cookie, handles 401 anywhere (toast + redirect), login/register/logout toasts
- [x] Public pages: landing `/`, `/login` (Password | MPIN tabs), `/register` (strength meter, MPIN confirm, auto-login)
- [x] Guarded pages: `/dashboard` (totals, account cards, new-account modal), `/accounts/[accountId]`
      (balance hero, withdraw + transfer, filterable + paginated history, copy id), `/transfer`
      (own accounts or peer by account ID, live preview, success card)
- [x] Admin (optional): env credentials, `/admin/login` + `/admin` credit console;
      peer transfers allowed; admin cannot withdraw/transfer
- [x] Toasts for every outcome; server error codes are mapped to friendly messages (`lib/client/notify.ts`)
- [x] Client checks are convenience only; every rule is re-enforced by the API and database
- [x] Verified in the browser: register, password + MPIN login, account create, credit, debit,
      peer transfer, logout, route guard, foreign-account screen, admin console, light theme

## Phase 4 — Testing

- [x] `scripts/e2e.mjs`: offline checks (auth gating, validation, 405, 404)
- [x] DB-level suite (see Phase 1)
- [x] `npm run test:e2e` full run (auth, cookie sessions, lockout + reset, admin login/credit,
      user credit/debit walkthrough, isolation, peer transfers, parallel writes, page gate)

## Phase 5 — AWS hosting

- [ ] Amplify Hosting (or ECS/Fargate + ALB)
- [ ] Env vars in AWS: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_PEPPER`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- [ ] Deploy production build, smoke-test against API.md curls, `/health` as health check

## Phase 6 — Submission pack (assessment §11)

- [x] Source code
- [x] README — local run + env + schema + features + tests (maintained per feature)
- [x] API documentation = [API.md](API.md)
- [x] Assumptions (this file + README)

---

## Requirements traceability

| Spec § | Requirement | Where |
|---|---|---|
| 1 | Create account; fields; balance 0; no client balance | 3.1 · API §5 |
| 2 | Credit / debit / reject debit / duplicate ref | 3.2 · API §7 |
| 3 | Get balance; 404 if missing | 3.3 · API §8 |
| 4 | History; filter; pagination; latest-first | 3.4 · API §9 |
| 5 | Immutability; balance consistency | Phase 1, 3.5 · API §10 |
| 6 | Atomicity (create tx + update balance) | Phase 1 (single DB function/transaction) |
| 7 | Validations | Phase 2 · Error catalog |
| 8 | HTTP codes + consistent errors | Phase 2 · Error catalog |
| 9 | Bonus transfer + atomic rollback | 3.7 · API §12 |
| 10 | Clean structure; constraints; runnable locally | Phase 0–1, README |
| 11 | Code + README + API docs + Assumptions | Phase 6 |
| — | Login (password / MPIN) + per-user data isolation | 3.0, Phase 1 · API §1–4 |
