# LedgerFlow — API Documentation

Transaction Ledger API (assessment contract) with per-user authentication.

| | |
|---|---|
| Runtime | **Next.js (latest)** App Router Route Handlers |
| Database | **Supabase** (Postgres) |
| Hosting | **AWS** |
| Base URL | `/api/v1` |
| Auth | `Authorization: Bearer <token>` **or** the `lf_session` HttpOnly cookie (both issued by [Login](#2-login)) |
| Build plan | [plan.md](plan.md) |

Tick each checkbox when that endpoint (or behavior) is implemented **and verified**
(`npm run test:e2e` covers every behavior listed here).
Keep in sync with [plan.md](plan.md). **This file is documentation only — no implementation lives here.**

---

## Conventions

| Topic | Rule |
|---|---|
| Content-Type | `application/json` |
| IDs | UUID v4 |
| Money | Decimal strings with 2 places (e.g. `"100.00"`). Never floats in responses |
| Timestamps | ISO-8601 UTC with milliseconds (`created_at`) |
| Pagination | `page` (default `1`), `limit` (default `20`, max `100`) |
| Sorting (history) | Latest first: `created_at DESC`, then `id DESC` |
| Authentication | Every endpoint except `register`, `login`, `admin/login` and `/health` requires a session |
| Route handlers | `app/api/v1/.../route.ts` (Next.js) |

### Authentication & data isolation

- Two login options: **username + password** or **username + MPIN** (a 4–6 digit PIN set at registration).
- A successful login returns an opaque session `token` (valid 8 hours, revocable via logout).
  Send it as `Authorization: Bearer <token>` on every protected request.
- Login also sets the same token as an **`lf_session` cookie** (`HttpOnly`, `SameSite=Strict`, `Path=/`,
  `Secure` in production, 8 h). The web app uses only the cookie, so the token is never readable by
  JavaScript. If both are sent, the `Authorization` header wins. Logout revokes the session and clears the cookie.
- **A user can only see and operate on their own accounts** (except peer transfers: destination may be
  anyone's). Reading another user's account/balance/history is `404 ACCOUNT_NOT_FOUND`.
- Users may **credit or debit** their own accounts via `POST …/transactions`.
- **Admin** (optional): env credentials + `lf_admin` cookie; can list every account and credit any of them.
  Cannot withdraw or transfer. Admin tokens are rejected by user APIs (and vice versa).
- Passwords and MPINs are never stored in plain text (scrypt + server-side pepper) and are never returned.
- 5 consecutive failed logins (password or MPIN) lock the user for 15 minutes (`429 TOO_MANY_ATTEMPTS`).

### Success shapes

Single resource:

```json
{ "data": { } }
```

List with pagination:

```json
{
  "data": [ ],
  "pagination": {
    "current_page": 1,
    "page_size": 20,
    "total_records": 0,
    "total_pages": 0
  }
}
```

### Error shape (all errors)

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable summary",
    "details": [
      { "field": "amount", "message": "Amount must be greater than 0" }
    ]
  }
}
```

`details` may be an array of field errors, an object (e.g. duplicate payload), or omitted.

---

## Error Catalog

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing/blank fields, unexpected fields (e.g. client `balance`), invalid JSON body |
| `INVALID_ACCOUNT_ID` | 400 | Path/body account id is not a valid UUID |
| `INVALID_TRANSACTION_TYPE` | 400 | `type` not `credit` or `debit` |
| `INVALID_AMOUNT` | 400 | Not a number, `<= 0`, more than 2 decimal places, overflow |
| `INVALID_PAGINATION` | 400 | `page`/`limit` non-integer, `< 1`, `limit > 100`, or `page` too large |
| `UNAUTHENTICATED` | 401 | Missing, malformed, unknown, expired or revoked bearer/admin token |
| `INVALID_CREDENTIALS` | 401 | Unknown username or wrong password/MPIN/admin password (same response) |
| `ACCOUNT_NOT_FOUND` | 404 | Well-formed UUID, account does not exist **or is not visible to the caller** |
| `ROUTE_NOT_FOUND` | 404 | Unknown path |
| `TRANSACTION_IMMUTABLE` | 405 | Attempt to update or delete a transaction |
| `USERNAME_TAKEN` | 409 | Registration with an existing username (case-insensitive) |
| `DUPLICATE_TRANSACTION` | 409 | Same `reference_id` already used on this account |
| `INSUFFICIENT_BALANCE` | 422 | Debit/transfer amount exceeds available balance |
| `SAME_ACCOUNT_TRANSFER` | 422 | `from_account_id` equals `to_account_id` |
| `TOO_MANY_ATTEMPTS` | 429 | User locked after repeated failed logins (`Retry-After` header set) |
| `INTERNAL_ERROR` | 500 | Unexpected failure (no stack/SQL leaked) |

---

## Endpoints Checklist

Authentication
- [x] [Register](#1-register) — `POST /auth/register`
- [x] [Login](#2-login) — `POST /auth/login` (username + password **or** username + MPIN)
- [x] [Current user](#3-current-user) — `GET /auth/me`
- [x] [Logout](#4-logout) — `POST /auth/logout`

Ledger (require user login; scoped to the logged-in user unless noted)
- [x] [Create Account](#5-create-account) — `POST /accounts`
- [x] [List My Accounts](#6-list-my-accounts) — `GET /accounts`
- [x] [Get One Account](#6a-get-one-account) — `GET /accounts/:accountId`
- [x] [Lookup Account](#6b-lookup-account) — `GET /accounts/lookup/:accountId` (peer transfer helper)
- [x] [Add Transaction](#7-add-transaction) — `POST /accounts/:accountId/transactions` (credit or debit)
- [x] [Get Account Balance](#8-get-account-balance) — `GET /accounts/:accountId/balance`
- [x] [Get Transaction History](#9-get-transaction-history) — `GET /accounts/:accountId/transactions`
- [x] [Immutability](#10-transaction-immutability) — reject PUT/PATCH/DELETE on transactions
- [x] [Health](#11-health) — `GET /health`
- [x] [Money Transfer](#12-money-transfer-bonus) — `POST /transfers` (own or peer destination)

Admin (env credentials; `lf_admin` cookie; credit only)
- [x] [Admin login](#13-admin) — `POST /admin/login`
- [x] [Admin me / logout](#13-admin) — `GET /admin/me`, `POST /admin/logout`
- [x] [List all accounts](#13-admin) — `GET /admin/accounts`
- [x] [Credit account](#13-admin) — `POST /admin/accounts/:accountId/credit`

---

## 1. Register

**Status:** - [x] Done

`POST /api/v1/auth/register` — public

Creates a user. Both a password and an MPIN are set so either can be used to log in.

### Request

```json
{
  "name": "Alice Khan",
  "username": "alice",
  "password": "correct-horse-1",
  "mpin": "4821"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Display / real name (1–80 chars). Shown in the UI |
| `username` | string | yes | 3–32 chars: letters, digits, `_`. Stored lowercase; unique case-insensitively. Used to sign in |
| `password` | string | yes | 8–128 chars |
| `mpin` | string | yes | 4–6 digits (string, so leading zeros are kept) |

### Success — `201 Created`

```json
{
  "data": {
    "id": "0f4c1c8e-6d52-4a53-8a0c-1b2b0c6c5d11",
    "name": "Alice Khan",
    "username": "alice",
    "created_at": "2026-10-27T14:00:00.000Z"
  }
}
```

### Errors

| Status | Code | Case |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad/missing field, unexpected field, invalid JSON |
| 409 | `USERNAME_TAKEN` | Username already registered |

### Behaviors

- [x] Creates user; secrets are hashed, never stored or returned in plain text
- [x] Username unique (case-insensitive)
- [x] Field validation (username format, password length, MPIN digits)

### curl

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Khan","username":"alice","password":"correct-horse-1","mpin":"4821"}'
```

---

## 2. Login

**Status:** - [x] Done

`POST /api/v1/auth/login` — public

Two options, selected by `method`.

### Option 1 — username + password

```json
{ "method": "password", "username": "alice", "password": "correct-horse-1" }
```

### Option 2 — username + MPIN

```json
{ "method": "mpin", "username": "alice", "mpin": "4821" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `method` | `"password"` \| `"mpin"` | yes | Chooses the credential type |
| `username` | string | yes | Case-insensitive |
| `password` | string | when `method=password` | |
| `mpin` | string | when `method=mpin` | 4–6 digits |

Sending the other method's credential field (e.g. `mpin` with `method=password`) is a `VALIDATION_ERROR`.

### Success — `200 OK`

```json
{
  "data": {
    "token": "lf_Qm9v...",
    "token_type": "Bearer",
    "expires_at": "2026-10-27T22:00:00.000Z",
    "user": { "id": "0f4c1c8e-6d52-4a53-8a0c-1b2b0c6c5d11", "username": "alice", "name": "Alice Khan" }
  }
}
```

Use it as `Authorization: Bearer <token>`. The token is shown only once.

The response also carries `Set-Cookie: lf_session=<token>; Path=/; Max-Age=28800; HttpOnly; SameSite=Strict`
(plus `Secure` in production) for browser clients. Failed logins never set a cookie.

### Errors

| Status | Code | Case |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/unknown `method`, missing credential, bad MPIN format |
| 401 | `INVALID_CREDENTIALS` | Unknown user **or** wrong password/MPIN (identical response) |
| 429 | `TOO_MANY_ATTEMPTS` | User locked for 15 min after 5 consecutive failures; `Retry-After` header set |

### Behaviors

- [x] Login with username + password
- [x] Login with username + MPIN
- [x] Login sets an `HttpOnly`, `SameSite=Strict` session cookie that authenticates later requests
- [x] Unknown user and wrong secret return the same 401 (no user enumeration)
- [x] Password is not accepted as MPIN and vice versa
- [x] 5 consecutive failures lock the user (even for correct credentials) for 15 minutes
- [x] Successful login resets the failure counter

### curl

```bash
# password
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"method":"password","username":"alice","password":"correct-horse-1"}'

# MPIN
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"method":"mpin","username":"alice","mpin":"4821"}'
```

---

## 3. Current user

**Status:** - [x] Done

`GET /api/v1/auth/me` — requires login

```json
{ "data": { "id": "0f4c1c8e-6d52-4a53-8a0c-1b2b0c6c5d11", "username": "alice", "name": "Alice Khan" } }
```

| Status | Code | Case |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing/invalid/expired/revoked token |

---

## 4. Logout

**Status:** - [x] Done

`POST /api/v1/auth/logout` — requires login. Revokes the token used for the request
(other sessions of the same user stay valid).

```json
{ "data": { "logged_out": true } }
```

The response also clears the `lf_session` cookie (`Max-Age=0`).

### Behaviors

- [x] Token is rejected (`401`) after logout
- [x] The session cookie is cleared and no longer authenticates

---

## 5. Create Account

**Status:** - [x] Done

`POST /api/v1/accounts` — requires login

Creates a new account **owned by the logged-in user**. Initial balance is always `0`.
Client must not set balance.

### Request

```json
{
  "name": "Alice"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Non-empty after trim. Max 255 |

### Success — `201 Created`

```json
{
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "name": "Alice",
    "balance": "0.00",
    "created_at": "2026-10-27T14:22:01.123Z"
  }
}
```

### Errors

| Status | Code | Case |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Not logged in |
| 400 | `VALIDATION_ERROR` | Missing/blank `name` |
| 400 | `VALIDATION_ERROR` | Client sent `balance` (or other forbidden fields) |
| 400 | `VALIDATION_ERROR` | Invalid / empty JSON body |

### Behaviors

- [x] `id` unique and system-generated
- [x] `name` required
- [x] Initial balance always `"0.00"`
- [x] `created_at` system-generated
- [x] Client cannot set initial balance
- [x] Account is owned by the logged-in user (never returned with another user's data)

### curl

```bash
curl -s -X POST http://localhost:3000/api/v1/accounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice"}'
```

---

## 6. List My Accounts

**Status:** - [x] Done

`GET /api/v1/accounts?page=1&limit=20` — requires login

Returns **only the logged-in user's** accounts, newest first. This is how a user discovers their account ids.

```json
{
  "data": [
    { "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "name": "Alice", "balance": "100.00", "created_at": "2026-10-27T14:22:01.123Z" }
  ],
  "pagination": { "current_page": 1, "page_size": 20, "total_records": 1, "total_pages": 1 }
}
```

| Status | Code | Case |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Not logged in |
| 400 | `INVALID_PAGINATION` | bad `page` / `limit` |

### Behaviors

- [x] Never includes another user's accounts
- [x] Paginated, newest first

---

## 6a. Get One Account

**Status:** - [x] Done

`GET /api/v1/accounts/:accountId` — requires login

Returns a single account owned by the logged-in user (used by the web app for the account page).

### Success — `200 OK`

```json
{ "data": { "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "name": "Alice", "balance": "100.00", "created_at": "2026-10-27T14:22:01.123Z" } }
```

| Status | Code | Case |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Not logged in |
| 400 | `INVALID_ACCOUNT_ID` | `accountId` is not a UUID |
| 404 | `ACCOUNT_NOT_FOUND` | Missing **or** owned by another user (identical response) |

### Behaviors

- [x] Returns `id`, `name`, `balance`, `created_at`
- [x] Another user's account is indistinguishable from a non-existent one (404)

---

## 6b. Lookup Account

**Status:** - [x] Done

`GET /api/v1/accounts/lookup/:accountId` — requires login

Helper for peer transfers: confirms an account exists and returns its **name** and owner username.
Never returns balance.

### Success — `200 OK`

```json
{
  "data": {
    "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "name": "Savings",
    "owner_username": "alice",
    "owner_name": "Alice Khan"
  }
}
```

### Errors

| Status | Code | Case |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Not logged in |
| 400 | `INVALID_ACCOUNT_ID` | not a UUID |
| 404 | `ACCOUNT_NOT_FOUND` | no such account |

---

## 7. Add Transaction

**Status:** - [x] Done

`POST /api/v1/accounts/:accountId/transactions` — requires login

Adds a **credit** or **debit** to one of **your** accounts. Creating the transaction and updating
the balance is **atomic**.

### Request

```json
{
  "type": "credit",
  "amount": "50.00",
  "description": "Salary",
  "reference_id": "pay-2026-10"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `"credit"` \| `"debit"` | yes | |
| `amount` | number or numeric string | yes | `> 0`, max 2 decimal places |
| `description` | string | no | Max 500 |
| `reference_id` | string | yes | Unique **per account**. Max 128 |

### Success — `201 Created`

```json
{
  "data": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "type": "credit",
    "amount": "50.00",
    "description": "Salary",
    "reference_id": "pay-2026-10",
    "transfer_id": null,
    "created_at": "2026-10-27T14:30:00.000Z",
    "balance": "50.00"
  }
}
```

### Credit / debit rules

Current `100` + credit `50` → `150`. Current `100` − debit `30` → `70`.
Debit of `150` on balance `100` → **rejected**, balance stays `100`.

### Duplicate `reference_id` (same account)

`409 DUPLICATE_TRANSACTION` with the existing transaction in `details`; balance unchanged.
Same `reference_id` on a **different** account is allowed.

### Errors

| Status | Code | Case |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Not logged in |
| 400 | `INVALID_ACCOUNT_ID` | `accountId` not a UUID |
| 400 | `INVALID_TRANSACTION_TYPE` | `type` not credit/debit |
| 400 | `INVALID_AMOUNT` | amount invalid / `<= 0` / too many decimals |
| 400 | `VALIDATION_ERROR` | missing fields / bad body |
| 404 | `ACCOUNT_NOT_FOUND` | account missing **or not yours** |
| 409 | `DUPLICATE_TRANSACTION` | same `reference_id` on this account |
| 422 | `INSUFFICIENT_BALANCE` | debit exceeds balance |

### Behaviors

- [x] Credit increases balance; debit decreases it
- [x] Debit rejected when insufficient; balance unchanged
- [x] Duplicate same account → 409; same reference on other accounts OK
- [x] Create + balance update is atomic
- [x] Cannot credit/debit another user's account (404)
- [x] Concurrent debits never overdraw; concurrent identical `reference_id` creates exactly one row

### curl

```bash
curl -s -X POST http://localhost:3000/api/v1/accounts/{accountId}/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"credit","amount":"50.00","description":"Salary","reference_id":"pay-2026-10"}'
```

---

## 8. Get Account Balance

**Status:** - [x] Done

`GET /api/v1/accounts/:accountId/balance` — requires login

### Path params

| Param | Type | Notes |
|---|---|---|
| `accountId` | UUID | Must exist and belong to the logged-in user |

### Success — `200 OK`

```json
{
  "data": {
    "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "balance": "100.00"
  }
}
```

### Errors

| Status | Code | Case |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Not logged in |
| 400 | `INVALID_ACCOUNT_ID` | not a UUID |
| 404 | `ACCOUNT_NOT_FOUND` | account does not exist or belongs to another user |

### Behaviors

- [x] Returns `account_id` and `balance`
- [x] 404 when account missing
- [x] 404 (identical to missing) when the account belongs to another user
- [x] Balance equals sum of valid credits minus valid debits

### curl

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/accounts/{accountId}/balance
```

---

## 9. Get Transaction History

**Status:** - [x] Done

`GET /api/v1/accounts/:accountId/transactions` — requires login

### Path params

| Param | Type | Notes |
|---|---|---|
| `accountId` | UUID | Must exist and belong to the logged-in user |

### Query params

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `type` | `"credit"` \| `"debit"` | no | both | Filter by transaction type |
| `page` | integer | no | `1` | `>= 1` |
| `limit` | integer | no | `20` | `1..100` |

### Success — `200 OK`

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "type": "debit",
      "amount": "20.00",
      "description": "Coffee",
      "reference_id": "pos-99",
      "transfer_id": null,
      "created_at": "2026-10-27T16:00:00.000Z"
    },
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "type": "credit",
      "amount": "50.00",
      "description": "Salary",
      "reference_id": "pay-2026-10",
      "transfer_id": null,
      "created_at": "2026-10-27T14:30:00.000Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "page_size": 20,
    "total_records": 2,
    "total_pages": 1
  }
}
```

### Errors

| Status | Code | Case |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Not logged in |
| 400 | `INVALID_ACCOUNT_ID` | not a UUID |
| 400 | `INVALID_TRANSACTION_TYPE` | `type` query invalid |
| 400 | `INVALID_PAGINATION` | bad `page` / `limit` |
| 404 | `ACCOUNT_NOT_FOUND` | account does not exist or belongs to another user |

### Behaviors

- [x] Filter by `type=credit` or `type=debit`
- [x] No `type` → return both
- [x] Pagination via `page` and `limit`
- [x] Meta includes `current_page`, `page_size`, `total_records`, `total_pages`
- [x] Sorted latest-first by `created_at`
- [x] Another user's history is never readable (404)

### curl

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/accounts/{accountId}/transactions?type=credit&page=1&limit=20"
```

---

## 10. Transaction Immutability

**Status:** - [x] Done

Once created, a transaction cannot be edited or deleted through the API.

The following must remain unchanged: `type`, `amount`, `description`, `reference_id`, `account_id`, `created_at`.

### Rejected methods

| Method | Path | Response |
|---|---|---|
| `PUT` | `/api/v1/accounts/:accountId/transactions/:transactionId` | `405 TRANSACTION_IMMUTABLE` |
| `PATCH` | `/api/v1/accounts/:accountId/transactions/:transactionId` | `405 TRANSACTION_IMMUTABLE` |
| `DELETE` | `/api/v1/accounts/:accountId/transactions/:transactionId` | `405 TRANSACTION_IMMUTABLE` |

```json
{
  "error": {
    "code": "TRANSACTION_IMMUTABLE",
    "message": "Transactions cannot be modified or deleted"
  }
}
```

### Behaviors

- [x] No update endpoint for transactions
- [x] No delete endpoint for transactions
- [x] Explicit `405` for PUT/PATCH/DELETE
- [x] DB-level trigger also blocks UPDATE/DELETE/TRUNCATE (transfers are append-only too)

---

## 11. Health

**Status:** - [x] Done

`GET /health` — public

Liveness + database connectivity check (not versioned under `/api/v1` so load balancers can hit it simply).

### Success — `200 OK`

```json
{
  "status": "ok",
  "database": "up"
}
```

### Failure — `503 Service Unavailable`

```json
{
  "status": "degraded",
  "database": "down"
}
```

### Behaviors

- [x] Returns process health
- [x] Checks DB connectivity

### curl

```bash
curl -s http://localhost:3000/health
```

---

## 12. Money Transfer (Bonus)

**Status:** - [x] Done

`POST /api/v1/transfers` — requires login

Moves money from **one of your accounts** to another account — yours **or** someone else's.
Atomic debit on the source + credit on the destination. Partial transfers are never possible.
Source must be yours; destination must exist and differ from source. Missing/foreign **source** →
`404 ACCOUNT_NOT_FOUND`. Missing destination → same.

### Request

```json
{
  "from_account_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "to_account_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "amount": "30.00",
  "description": "Rent share",
  "reference_id": "xfer-001"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `from_account_id` | UUID | yes | Source; **must be yours**; sufficient balance |
| `to_account_id` | UUID | yes | Destination; yours or peer; must differ from source |
| `amount` | number or numeric string | yes | `> 0`, max 2 decimals |
| `description` | string | no | Applied to both ledger legs |
| `reference_id` | string | yes | Unique for the source account |

The debit uses your `reference_id`; the credit uses `transfer:<transfer_id>`. Both carry `transfer_id`.

### Success — `201 Created`

```json
{
  "data": {
    "id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "from_account_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "to_account_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "amount": "30.00",
    "description": "Rent share",
    "reference_id": "xfer-001",
    "created_at": "2026-10-27T17:00:00.000Z",
    "from_balance": "70.00",
    "to_balance": "80.00",
    "to_is_own": true,
    "debit_transaction_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "credit_transaction_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

For a peer destination, `to_is_own` is `false` and `to_balance` is `null` (balance privacy).

### Errors

| Status | Code | Case |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Not logged in |
| 400 | `INVALID_ACCOUNT_ID` | either id not a UUID |
| 400 | `INVALID_AMOUNT` | invalid amount |
| 400 | `VALIDATION_ERROR` | missing fields / bad body |
| 404 | `ACCOUNT_NOT_FOUND` | source missing/not yours, or destination missing |
| 409 | `DUPLICATE_TRANSACTION` | duplicate `reference_id` for source |
| 422 | `INSUFFICIENT_BALANCE` | source cannot cover amount |
| 422 | `SAME_ACCOUNT_TRANSFER` | source === destination |

### Behaviors

- [x] Source must be yours with sufficient balance
- [x] Destination may be yours or another user's
- [x] Peer `to_balance` is withheld (`null`)
- [x] Debit + credit atomic; any failure rolls back; no partial transfer
- [x] Source ≠ destination
- [x] Concurrent opposing transfers do not deadlock

### curl

```bash
curl -s -X POST http://localhost:3000/api/v1/transfers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"from_account_id":"...","to_account_id":"...","amount":"30.00","description":"Rent share","reference_id":"xfer-001"}'
```

---

## 13. Admin

**Status:** - [x] Done

Credentials live only in env (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) — not a `users` row.
Successful login returns a token and sets the **`lf_admin`** HttpOnly cookie. Admin can **only credit**.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/admin/login` | `{ "username", "password" }` → `{ data: { token, username } }` + `Set-Cookie: lf_admin` |
| `GET` | `/admin/me` | `{ data: { username } }` |
| `POST` | `/admin/logout` | revokes + clears cookie |
| `GET` | `/admin/accounts?page=&limit=` | every account with `owner_id`, `owner_username`, balance |
| `POST` | `/admin/accounts/:accountId/credit` | optional admin credit of any account |

### Credit request

```json
{
  "amount": "100.00",
  "description": "Opening deposit",
  "reference_id": "admin-open-1"
}
```

Success `201` shape matches a normal transaction plus `balance` after the credit.

### Behaviors

- [x] Wrong admin credentials → `401 INVALID_CREDENTIALS`
- [x] User session cannot call admin routes (`401`)
- [x] Admin session cannot call user ledger routes (`401`)
- [x] Credit any existing account; missing id → `404`
- [x] Duplicate `reference_id` on that account → `409`
- [x] No admin withdraw or transfer endpoints

### curl

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"$ADMIN_PASSWORD"}'

curl -s -X POST http://localhost:3000/api/v1/admin/accounts/{accountId}/credit \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":"100.00","description":"Opening deposit","reference_id":"admin-open-1"}'
```

---

## Data Integrity Notes (cross-cutting)

- [x] Account balance always reflects all **valid** transactions for that account
- [x] Spec example: credits 100 + 50, debits 30 + 20 → balance `100.00`
- [x] Rejected/failed transactions never change balance
- [x] Transactions are immutable after creation
- [x] DB constraints: `UNIQUE(account_id, reference_id)`, `amount > 0`, `balance >= 0`, type enum
- [x] Concurrent debits serialized with `SELECT … FOR UPDATE` so balance never goes negative
- [x] `accounts.balance` can only change by inserting a transaction (trigger); direct edits are rejected by the database
- [x] Every table has Row Level Security enabled with no policies; only the server role can reach the data

---

## Resource Field Reference

### User

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | Display / real name (shown in UI) |
| `username` | string | Unique, lowercase (login handle) |
| `created_at` | ISO-8601 | System-generated |

Password hash, MPIN hash and lockout counters are internal and never exposed.

### Account

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | Required |
| `balance` | money string | Always `>= 0`, starts at `"0.00"` |
| `created_at` | ISO-8601 | System-generated |

Each account belongs to exactly one user (internal `user_id`, not exposed).

### Transaction

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `account_id` | UUID | FK → accounts |
| `type` | `"credit"` \| `"debit"` | |
| `amount` | money string | `> 0` |
| `description` | string \| null | Optional |
| `reference_id` | string | Unique per account |
| `created_at` | ISO-8601 | System-generated |
| `transfer_id` | UUID \| null | Set when created by a transfer |

### Transfer

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `from_account_id` | UUID | Source |
| `to_account_id` | UUID | Destination |
| `amount` | money string | `> 0` |
| `description` | string \| null | Optional |
| `reference_id` | string | Unique per source account |
| `created_at` | ISO-8601 | System-generated |
