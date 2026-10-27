# LedgerFlow

A transaction ledger (REST API **and** web app) built with **Next.js 16 (App Router)**, **TypeScript** and
**Supabase (Postgres)**. Users log in (username + password **or** MPIN), create accounts, post credits/debits,
read balances and history, and move money between their own accounts. A user can never see or touch another
user's data.

- API contract: [docs/API.md](docs/API.md)
- Build plan / status: [docs/plan.md](docs/plan.md)
- Assignment: [docs/full_stack_developer_assessment.md](docs/full_stack_developer_assessment.md)

---

## Features

> Keep this list updated whenever a feature is added or changed.

**Authentication**
- Register with username, password and a 4–6 digit MPIN
- **Login option 1:** username + password
- **Login option 2:** username + MPIN
- Opaque session tokens (8 h), revocable via logout; only a SHA-256 of the token is stored
- Browser sessions use an `HttpOnly` + `SameSite=Strict` (`Secure` in production) cookie, so the token is never
  readable by JavaScript; API clients can still send `Authorization: Bearer <token>`
- Passwords/MPINs hashed with scrypt + a server-side pepper; never stored or returned in plain text
- Brute-force protection: 5 consecutive failed logins lock the user for 15 minutes
- No user enumeration: unknown user and wrong secret produce the same response

**Accounts & isolation**
- Create an account (balance always starts at `0.00`; the client can't set it)
- List only your own accounts, or fetch one (`GET /accounts/:id`)
- Every account/balance/history/transaction/transfer call is scoped to the logged-in user;
  another user's account id answers `404 ACCOUNT_NOT_FOUND`, identical to a non-existent id

**Transactions**
- Credit and debit with exact decimal money (`NUMERIC(18,2)`, strings in responses)
- Debit rejected when the balance is insufficient (balance unchanged)
- Idempotent `reference_id` per account → `409` with the existing transaction; same reference allowed on other accounts
- Insert + balance update are one atomic database operation; concurrent writers are serialised with row locks
- Transactions are immutable (API `405` + database triggers)
- Optional admin can also credit any account (separate login)

**History & balance**
- Balance endpoint
- History with `type` filter, `page`/`limit` pagination metadata, latest-first ordering

**Transfers**
- Atomic debit + credit from one of your accounts to **any** other account (your own or another user's)
- Destination balance is hidden when sending to someone else
- Lookup endpoint confirms recipient name + username (never the balance)
- Rollback on any failure, deadlock-free locking

**Admin**
- Credentials live only in env (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) — not a row in `users`
- Separate HttpOnly cookie (`lf_admin`); can list every account and **credit** any of them
- Cannot withdraw or transfer; admin token is rejected by user APIs
- UI: **Login as admin** on the sign-in page → `/admin` credit console

**Web app**
- **Sign in** (Password / MPIN tabs) and **Create profile** (password, a 4-6 digit MPIN with confirmation, strength meter, auto sign-in).
  Both the password and the MPIN are stored only as salted scrypt hashes (`password_hash`, `mpin_hash`)
- **Dashboard:** total balance, account count, largest account, account cards, "New account" modal
- **Account page:** balance hero, **Add money / Withdraw / Transfer**, history with All / Money in / Money out tabs,
  page-size and pagination, copy account id (needed so others can send you money)
- **Transfer page:** to your own account **or** someone else (paste their account ID + look up), live preview,
  success summary
- **Admin console** (`/admin`): search every account and credit money; no withdraw/transfer
- Toast notifications for every outcome (signed in/out, account created, money added/withdrawn, transfer done,
  admin credit, duplicate reference, insufficient balance, session expired) with friendly messages per error code
- **Page gate (`proxy.ts`):** anyone without a valid session is always redirected to `/login` (including `/`),
  and signed-in users opening `/login` or `/register` go to the dashboard. The session is verified against the
  database, so forged, expired or revoked cookies are rejected and cleared. API routes are not redirected; they answer
  `401` JSON
- An expired session while using the app shows a toast and redirects to `/login`
- Foreign or unknown account ids show a neutral "Account not found" screen
- Warm, calm light design: cream paper background, espresso text and buttons, terracotta accents, olive for money in,
  brick for money out; Fraunces (headings and amounts) with DM Sans (text); no gradients, no dark mode
- Thin scrollbars that stay hidden until you scroll
- Responsive down to phone width, accessible labels/focus states, `₹` with Indian digit grouping
  (change `CURRENCY_SYMBOL` in `lib/client/format.ts`)
- The UI only pre-checks input for convenience; every rule is enforced again by the API and the database

**Platform**
- Consistent error envelope and error-code catalog
- `GET /health` with database connectivity check
- Row Level Security on every table; only the server role can reach the database
- End-to-end test suite (`npm run test:e2e`)

---

## Run locally

Requirements: Node.js 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local      # then fill in the three values (see below)
npm run dev                      # http://localhost:3000  (web app) and /api/v1 (REST API)
```

Open http://localhost:3000. You are sent to the sign-in page; choose **Create an account**, set a password and an
MPIN, and you land on the dashboard.

### Environment variables (`.env.local`, never committed)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL, e.g. `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** service-role/secret key (Supabase → Project Settings → API Keys). Never expose it to the browser |
| `AUTH_PEPPER` | Random secret ≥ 32 chars mixed into password/MPIN hashes. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Changing it invalidates all stored passwords/MPINs |
| `ADMIN_USERNAME` | Sole admin username (not stored in the database) |
| `ADMIN_PASSWORD` | Sole admin password (≥ 8 chars). Only used to credit accounts |

### Database

The schema lives in [`supabase/migrations/`](supabase/migrations/). Apply it to an empty Supabase project with
the Supabase SQL editor, `supabase db push`, or the Supabase MCP `apply_migration`.
(The `ledgerflow` project used during development already has it applied.)

### Quick tour

```bash
# 1. register, then log in with a password ...
curl -s -X POST localhost:3000/api/v1/auth/register -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"correct-horse-1","mpin":"4821"}'

curl -s -X POST localhost:3000/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"method":"password","username":"alice","password":"correct-horse-1"}'
# ... or with the MPIN
curl -s -X POST localhost:3000/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"method":"mpin","username":"alice","mpin":"4821"}'

# 2. use the returned token
export TOKEN=lf_...
curl -s -X POST localhost:3000/api/v1/accounts -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Alice"}'
```

More examples per endpoint: [docs/API.md](docs/API.md).

### Tests

```bash
npm run dev                         # in one terminal
npm run test:e2e                    # full suite against the real database
npm run test:e2e -- --offline       # only checks that need no database
BASE_URL=https://your-host npm run test:e2e
npm run lint && npm run build
```

The suite covers both login options, cookie sessions, lockout and its reset, admin login/credit,
the spec's balance walkthrough (+100 +50 −30 −20 = 100), rejected debits, duplicates,
pagination/filter/order, **cross-user isolation** (no foreign reads/credits/debits; peer transfers allowed),
parallel debits, parallel credits, own-account and peer transfers.
Ledger rows are immutable, so test data is not deleted; each run uses fresh random usernames.

---

## Architecture

```
Browser ──page request──▶ proxy.ts (valid session? else → /login)
Browser UI (app/(auth), app/(app), components/, lib/client/*)  ── same-origin fetch, HttpOnly cookie
Client ──HTTP──▶ Next.js Route Handlers (app/api/v1/**)
                   │  requireAuth (Bearer or cookie → user)   ── lib/auth
                   │  Zod validation / error mapping ── lib/validation, lib/http
                   ▼
                 lib/services/{auth,ledger}.ts
                   ▼   service-role Supabase client (server only)
                 Postgres functions (RPC) ── ownership filter, row locks, one transaction per call
                   ▼
                 Tables + constraints + triggers
```

Business rules that matter for money live in the database (constraints, triggers, functions), not only in
application code, so they hold no matter which code path writes.

### Database schema

```
users ─┬─< sessions            (token_hash, expires_at, revoked_at, login_method)
       └─< accounts ─┬─< transactions >─┐   (append-only ledger; transfer_id for transfer legs)
                     ├─< transfers ─────┘   (append-only; 1 debit leg + 1 credit leg each)
```

| Table | Key points |
|---|---|
| `users` | `username` unique (lowercase, format check), `password_hash`, `mpin_hash`, lockout counters |
| `sessions` | `token_hash` unique (SHA-256), expiry and revocation |
| `accounts` | `user_id` FK, `balance NUMERIC(18,2) CHECK (balance >= 0)`, name not blank |
| `transactions` | `UNIQUE (account_id, reference_id)`, `amount > 0`, type enum, history index `(account_id, created_at DESC, id DESC)`, partial unique `(transfer_id, type)` |
| `transfers` | `CHECK (from <> to)`, `amount > 0`, `UNIQUE (from_account_id, reference_id)` |

Integrity guarantees enforced by the database:

- **Single source of balance changes:** `accounts.balance` changes only through an `AFTER INSERT` trigger on
  `transactions`; a guard trigger rejects direct edits of `balance`, `user_id`, `id`, `created_at`.
  So balance always equals Σ credits − Σ debits. (It is the one intentionally derived column — the assessment
  requires an account `balance` — and it can't drift.)
- **Immutability:** `UPDATE`/`DELETE`/`TRUNCATE` on `transactions` and `transfers` raise an error.
- **No overdraft:** functions lock the account row (`FOR UPDATE`) and check the balance; the `balance >= 0`
  constraint is the last line of defence.
- **Idempotency:** `reference_id` is unique per account; duplicates return the existing row, no write.
- **Atomic transfers:** both accounts locked in id order (no deadlocks); both ledger legs and the transfer row
  are written in one transaction.
- **Least privilege:** RLS is on for every table with no policies; table and function privileges are revoked
  from `anon`/`authenticated`. Only the server's service role can call the functions.
- **No redundant data:** no stored totals, no duplicated user/account columns; transfer legs are found via
  `transactions.transfer_id`, not extra pointer columns.

---

## Assumptions

- Auth was added to the assessment scope: every endpoint except register/login/health requires login.
- A user registers with both a password and an MPIN so either login option always works.
  (Changing MPIN/password is not implemented yet.)
- Transfers are only between the logged-in user's own accounts.
- A foreign account id returns the same `404` as a missing one (no existence leak).
- Money is `NUMERIC(18,2)`; amounts may be sent as numbers or numeric strings (max 2 decimals) and are always returned as strings.
- Duplicate `reference_id` → `409` (not `200`) with the existing transaction in `error.details`.
- A missing `type`/`amount` field is a `VALIDATION_ERROR`; a present-but-invalid one gets the specific code.
- `GET /health` is intentionally outside `/api/v1`.
- Login lockout is per user (shared by both methods). A determined attacker could deliberately lock a known
  username; a production deployment would add IP/device rate limiting at the edge (e.g. AWS WAF).
- Expired/revoked session rows are not purged automatically (a scheduled cleanup would be a later improvement).

## Hosting (AWS)

Planned target: **AWS Amplify Hosting** for Next.js (see [docs/plan.md](docs/plan.md), Phase 5). Set the three
environment variables above in the Amplify console, deploy, and use `/health` as the health check.
