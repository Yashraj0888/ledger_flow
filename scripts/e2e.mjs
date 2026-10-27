// End-to-end API tests. Run the app first (`npm run dev`), then:
//   npm run test:e2e                    # everything (needs a working .env.local)
//   npm run test:e2e -- --offline       # only checks that need no database
//   BASE_URL=https://host npm run test:e2e
//
// Test users/accounts are created with random names. Ledger rows are immutable
// by design, so test data is not deleted.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local so ADMIN_* are available to the test runner (the Next server
// already has them; this only helps the script call the admin API).
try {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {
  // Optional when the host already exports the vars.
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OFFLINE = process.argv.includes("--offline");
const run = Math.random().toString(36).slice(2, 8);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

let passed = 0;
let failed = 0;
let adminToken = null;

async function call(method, path, { body, token, raw } = {}) {
  const headers = {};
  if (body !== undefined || raw !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json, headers: res.headers };
}

function check(name, condition, extra) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`, extra === undefined ? "" : JSON.stringify(extra));
  }
}

const expectError = (name, res, status, code) =>
  check(`${name} -> ${status} ${code}`, res.status === status && res.json?.error?.code === code, res.json ?? res.status);

async function register(username, password = "correct-horse-1", mpin = "4821") {
  return call("POST", "/api/v1/auth/register", { body: { username, password, mpin } });
}
async function loginPassword(username, password = "correct-horse-1") {
  return call("POST", "/api/v1/auth/login", { body: { method: "password", username, password } });
}
async function loginMpin(username, mpin = "4821") {
  return call("POST", "/api/v1/auth/login", { body: { method: "mpin", username, mpin } });
}
async function newUser(prefix) {
  const username = `${prefix}_${run}`;
  const reg = await register(username);
  if (reg.status !== 201) throw new Error(`register failed: ${JSON.stringify(reg.json)}`);
  const login = await loginPassword(username);
  return { username, id: reg.json.data.id, token: login.json.data.token };
}
async function newAccount(token, name) {
  const res = await call("POST", "/api/v1/accounts", { token, body: { name } });
  if (res.status !== 201) throw new Error(`create account failed: ${JSON.stringify(res.json)}`);
  return res.json.data;
}
const tx = (token, accountId, body) =>
  call("POST", `/api/v1/accounts/${accountId}/transactions`, { token, body });
const balance = async (token, accountId) => (await call("GET", `/api/v1/accounts/${accountId}/balance`, { token })).json?.data?.balance;

async function adminLogin() {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be set in .env.local for live tests");
  }
  const res = await call("POST", "/api/v1/admin/login", {
    body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  if (res.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(res.json)}`);
  adminToken = res.json.data.token;
  return res;
}

/** User-initiated credit (assessment §2). */
async function credit(token, accountId, amount, reference_id, description = "e2e credit") {
  const res = await tx(token, accountId, {
    type: "credit",
    amount: String(amount),
    reference_id,
    description,
  });
  if (res.status !== 201) throw new Error(`credit failed: ${JSON.stringify(res.json)}`);
  return res.json.data;
}

/** Admin credit (optional extra path). */
async function adminCredit(accountId, amount, reference_id, description = "admin credit") {
  if (!adminToken) await adminLogin();
  const res = await call("POST", `/api/v1/admin/accounts/${accountId}/credit`, {
    token: adminToken,
    body: { amount: String(amount), reference_id, description },
  });
  if (res.status !== 201) throw new Error(`admin credit failed: ${JSON.stringify(res.json)}`);
  return res.json.data;
}

// ------------------------------------------------------------------ offline
async function offlineSuite() {
  console.log("\n[offline] auth gating, validation, immutability, 404");
  const id = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  expectError("accounts without token", await call("GET", "/api/v1/accounts"), 401, "UNAUTHENTICATED");
  expectError("create account without token", await call("POST", "/api/v1/accounts", { body: { name: "A" } }), 401, "UNAUTHENTICATED");
  expectError("transfer without token", await call("POST", "/api/v1/transfers", { body: {} }), 401, "UNAUTHENTICATED");
  expectError("balance without token", await call("GET", `/api/v1/accounts/${id}/balance`), 401, "UNAUTHENTICATED");
  expectError("history without token", await call("GET", `/api/v1/accounts/${id}/transactions`), 401, "UNAUTHENTICATED");
  expectError("post tx without token", await call("POST", `/api/v1/accounts/${id}/transactions`, { body: {} }), 401, "UNAUTHENTICATED");
  expectError("me without token", await call("GET", "/api/v1/auth/me"), 401, "UNAUTHENTICATED");

  expectError("register empty body", await call("POST", "/api/v1/auth/register", { raw: "" }), 400, "VALIDATION_ERROR");
  expectError("register invalid json", await call("POST", "/api/v1/auth/register", { raw: "{bad" }), 400, "VALIDATION_ERROR");
  const weak = await call("POST", "/api/v1/auth/register", { body: { username: "A!", password: "short", mpin: "12", extra: 1 } });
  expectError("register invalid fields", weak, 400, "VALIDATION_ERROR");
  check("register reports every bad field", Array.isArray(weak.json?.error?.details) && weak.json.error.details.length >= 4, weak.json);

  expectError("login unknown method", await call("POST", "/api/v1/auth/login", { body: { method: "otp", username: "a" } }), 400, "VALIDATION_ERROR");
  expectError("login mpin + password together", await call("POST", "/api/v1/auth/login", { body: { method: "mpin", username: "a", mpin: "1234", password: "x" } }), 400, "VALIDATION_ERROR");
  expectError("login non-numeric mpin", await call("POST", "/api/v1/auth/login", { body: { method: "mpin", username: "a", mpin: "abcd" } }), 400, "VALIDATION_ERROR");

  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const res = await call(method, `/api/v1/accounts/${id}/transactions/${id}`, method === "DELETE" ? undefined : { body: { amount: "1" } });
    expectError(`${method} transaction`, res, 405, "TRANSACTION_IMMUTABLE");
  }
  expectError("unknown route", await call("GET", "/api/v1/nope"), 404, "ROUTE_NOT_FOUND");
  expectError("unknown nested route", await call("POST", "/api/v1/accounts/x/y/z", { body: {} }), 404, "ROUTE_NOT_FOUND");
}

// ------------------------------------------------------------------- online
async function authSuite() {
  console.log("\n[auth] register / login (password + MPIN) / lockout / logout");
  const username = `auth_${run}`;
  const reg = await register(username);
  check("register -> 201", reg.status === 201 && reg.json?.data?.username === username, reg.json);
  check("register never returns secrets", !JSON.stringify(reg.json).match(/hash|password|mpin/i), reg.json);
  expectError("duplicate username", await register(username), 409, "USERNAME_TAKEN");
  expectError("duplicate username is case-insensitive", await register(username.toUpperCase()), 409, "USERNAME_TAKEN");

  const byPassword = await loginPassword(username);
  check("login with username+password -> 200 + token", byPassword.status === 200 && byPassword.json?.data?.token_type === "Bearer" && byPassword.json.data.token.startsWith("lf_"), byPassword.json);
  const byMpin = await loginMpin(username);
  check("login with username+MPIN -> 200 + token", byMpin.status === 200 && typeof byMpin.json?.data?.token === "string", byMpin.json);
  check("each login issues a distinct token", byPassword.json.data.token !== byMpin.json.data.token);

  // browser sessions: HttpOnly cookie, no JS-readable token needed
  const setCookie = byPassword.headers.get("set-cookie") ?? "";
  check("login sets an HttpOnly, SameSite=Strict session cookie", /lf_session=lf_/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie), setCookie);
  const cookieValue = setCookie.split(";")[0];
  const viaCookie = await fetch(BASE + "/api/v1/auth/me", { headers: { Cookie: cookieValue } });
  check("session cookie authenticates /auth/me", viaCookie.status === 200, viaCookie.status);
  const failedLogin = await loginPassword(username, "wrong-password-1");
  check("failed login sets no cookie", !(failedLogin.headers.get("set-cookie") ?? "").includes("lf_session=lf_"));

  const wrongPw = await loginPassword(username, "wrong-password-1");
  const unknown = await loginPassword(`nobody_${run}`, "whatever-123");
  expectError("wrong password", wrongPw, 401, "INVALID_CREDENTIALS");
  expectError("wrong MPIN", await loginMpin(username, "0000"), 401, "INVALID_CREDENTIALS");
  expectError("unknown user", unknown, 401, "INVALID_CREDENTIALS");
  check("unknown user and wrong password look identical", wrongPw.json.error.message === unknown.json.error.message);
  expectError("MPIN is not accepted as a password", await loginPassword(username, "4821"), 401, "INVALID_CREDENTIALS");

  const me = await call("GET", "/api/v1/auth/me", { token: byPassword.json.data.token });
  check("me returns the logged-in user", me.status === 200 && me.json?.data?.username === username, me.json);
  expectError("bogus token", await call("GET", "/api/v1/auth/me", { token: "lf_bogus" }), 401, "UNAUTHENTICATED");

  const out = await call("POST", "/api/v1/auth/logout", { token: byPassword.json.data.token });
  check("logout -> 200", out.status === 200, out.json);
  check("logout clears the session cookie", /lf_session=;/.test(out.headers.get("set-cookie") ?? "") && /Max-Age=0/i.test(out.headers.get("set-cookie") ?? ""), out.headers.get("set-cookie"));
  const cookieAfter = await fetch(BASE + "/api/v1/auth/me", { headers: { Cookie: cookieValue } });
  check("revoked session cookie no longer authenticates", cookieAfter.status === 401, cookieAfter.status);
  expectError("token unusable after logout", await call("GET", "/api/v1/auth/me", { token: byPassword.json.data.token }), 401, "UNAUTHENTICATED");
  check("other session still valid after logging one out", (await call("GET", "/api/v1/auth/me", { token: byMpin.json.data.token })).status === 200);

  // lockout: 5 consecutive failures lock the user for 15 minutes
  const lockUser = `lock_${run}`;
  await register(lockUser);
  let last;
  for (let i = 0; i < 5; i++) last = await loginMpin(lockUser, "9999");
  expectError("5th consecutive failure locks the user", last, 429, "TOO_MANY_ATTEMPTS");
  check("lock response has Retry-After", Number(last.headers.get("retry-after")) > 0);
  expectError("correct password rejected while locked", await loginPassword(lockUser), 429, "TOO_MANY_ATTEMPTS");

  // a successful login resets the failure counter (4 + success + 4 must not lock)
  const resetUser = `reset_${run}`;
  await register(resetUser);
  for (let i = 0; i < 4; i++) await loginMpin(resetUser, "9999");
  check("login succeeds after 4 failures", (await loginPassword(resetUser)).status === 200);
  let afterReset;
  for (let i = 0; i < 4; i++) afterReset = await loginMpin(resetUser, "9999");
  expectError("4 more failures after a success do not lock (counter was reset)", afterReset, 401, "INVALID_CREDENTIALS");
  check("user still able to log in", (await loginMpin(resetUser)).status === 200);
}

async function accountsSuite() {
  console.log("\n[accounts] create / validation");
  const alice = await newUser("alice");

  expectError("blank name", await call("POST", "/api/v1/accounts", { token: alice.token, body: { name: "   " } }), 400, "VALIDATION_ERROR");
  expectError("missing name", await call("POST", "/api/v1/accounts", { token: alice.token, body: {} }), 400, "VALIDATION_ERROR");
  expectError("client-supplied balance rejected", await call("POST", "/api/v1/accounts", { token: alice.token, body: { name: "A", balance: "500" } }), 400, "VALIDATION_ERROR");
  expectError("invalid json body", await call("POST", "/api/v1/accounts", { token: alice.token, raw: "nope" }), 400, "VALIDATION_ERROR");

  const created = await call("POST", "/api/v1/accounts", { token: alice.token, body: { name: "  Alice Main  " } });
  const a = created.json?.data;
  check("create -> 201, balance 0.00, trimmed name, system id/created_at",
    created.status === 201 && a.balance === "0.00" && a.name === "Alice Main" && /^[0-9a-f-]{36}$/.test(a.id) && !Number.isNaN(Date.parse(a.created_at)) && !("user_id" in a), created.json);
  const b = await newAccount(alice.token, "Alice Second");
  check("ids are unique", a.id !== b.id);

  const list = await call("GET", "/api/v1/accounts", { token: alice.token });
  check("list returns own accounts latest-first with pagination", list.status === 200 && list.json.data.length === 2 && list.json.data[0].id === b.id && list.json.pagination.total_records === 2, list.json);
  expectError("list invalid pagination", await call("GET", "/api/v1/accounts?limit=0", { token: alice.token }), 400, "INVALID_PAGINATION");
}

async function ledgerSuite() {
  console.log("\n[transactions] credits / debits / duplicates / validation");
  const alice = await newUser("led");
  const acc = await newAccount(alice.token, "Ledger");
  const other = await newAccount(alice.token, "Other");

  // Spec walkthrough: +100 +50 −30 −20 = 100
  const r1 = await credit(alice.token, acc.id, "100", "r1", "c1");
  check("credit 100 -> balance 100.00", r1.balance === "100.00" && r1.amount === "100.00" && r1.type === "credit", r1);
  await credit(alice.token, acc.id, "50", "r2");
  await tx(alice.token, acc.id, { type: "debit", amount: "30.00", reference_id: "r3" });
  const r4 = await tx(alice.token, acc.id, { type: "debit", amount: "20", reference_id: "r4" });
  check("spec example +100 +50 -30 -20 -> 100.00", r4.status === 201 && r4.json?.data?.balance === "100.00", r4.json);

  const big = await tx(alice.token, acc.id, { type: "debit", amount: "150", reference_id: "big" });
  expectError("debit 150 on balance 100 rejected", big, 422, "INSUFFICIENT_BALANCE");
  check("balance unchanged after rejected debit", (await balance(alice.token, acc.id)) === "100.00");

  const dup = await tx(alice.token, acc.id, { type: "debit", amount: "1", reference_id: "r3" });
  expectError("duplicate reference_id", dup, 409, "DUPLICATE_TRANSACTION");
  check("duplicate returns the existing transaction", dup.json?.error?.details?.existing_transaction?.amount === "30.00" && dup.json.error.details.existing_transaction.reference_id === "r3", dup.json);
  check("balance unchanged after duplicate", (await balance(alice.token, acc.id)) === "100.00");
  await credit(alice.token, other.id, "5", "r1");
  check("same reference_id allowed on a different account", (await balance(alice.token, other.id)) === "5.00");

  expectError("invalid type", await tx(alice.token, acc.id, { type: "refund", amount: "1", reference_id: "x" }), 400, "INVALID_TRANSACTION_TYPE");
  for (const [label, amount] of [["zero", "0"], ["negative", "-5"], ["3 decimals", "1.005"], ["text", "abc"], ["empty", ""], ["boolean", true], ["exponent", "1e3"], ["huge", "99999999999999999"]]) {
    expectError(`invalid amount (${label})`, await tx(alice.token, acc.id, { type: "debit", amount, reference_id: `bad-${label}` }), 400, "INVALID_AMOUNT");
  }
  expectError("missing reference_id", await tx(alice.token, acc.id, { type: "debit", amount: "1" }), 400, "VALIDATION_ERROR");
  expectError("blank reference_id", await tx(alice.token, acc.id, { type: "debit", amount: "1", reference_id: "  " }), 400, "VALIDATION_ERROR");
  expectError("unknown field", await tx(alice.token, acc.id, { type: "debit", amount: "1", reference_id: "u1", account_id: other.id }), 400, "VALIDATION_ERROR");
  expectError("invalid account id", await tx(alice.token, "not-a-uuid", { type: "debit", amount: "1", reference_id: "z" }), 400, "INVALID_ACCOUNT_ID");
  expectError("account does not exist", await tx(alice.token, "3fa85f64-5717-4562-b3fc-2c963f66afa6", { type: "debit", amount: "1", reference_id: "z" }), 404, "ACCOUNT_NOT_FOUND");
  check("rejected requests never changed the balance", (await balance(alice.token, acc.id)) === "100.00");

  console.log("\n[balance]");
  const bal = await call("GET", `/api/v1/accounts/${acc.id}/balance`, { token: alice.token });
  check("balance response shape", bal.status === 200 && bal.json.data.account_id === acc.id && bal.json.data.balance === "100.00", bal.json);
  expectError("balance invalid id", await call("GET", "/api/v1/accounts/xyz/balance", { token: alice.token }), 400, "INVALID_ACCOUNT_ID");
  expectError("balance unknown account", await call("GET", "/api/v1/accounts/3fa85f64-5717-4562-b3fc-2c963f66afa6/balance", { token: alice.token }), 404, "ACCOUNT_NOT_FOUND");

  console.log("\n[history] filter / pagination / ordering");
  const all = await call("GET", `/api/v1/accounts/${acc.id}/transactions`, { token: alice.token });
  check("no type filter returns credit and debit", all.status === 200 && all.json.pagination.total_records === 4 && new Set(all.json.data.map((t) => t.type)).size === 2, all.json);
  check("latest first (r4, r3, r2, r1)", all.json.data.map((t) => t.reference_id).join() === "r4,r3,r2,r1", all.json.data.map((t) => t.reference_id));
  const credits = await call("GET", `/api/v1/accounts/${acc.id}/transactions?type=credit`, { token: alice.token });
  check("type=credit", credits.json.data.length === 2 && credits.json.data.every((t) => t.type === "credit"), credits.json);
  const debits = await call("GET", `/api/v1/accounts/${acc.id}/transactions?type=debit`, { token: alice.token });
  check("type=debit", debits.json.data.length === 2 && debits.json.data.every((t) => t.type === "debit"), debits.json);
  const p2 = await call("GET", `/api/v1/accounts/${acc.id}/transactions?page=2&limit=3`, { token: alice.token });
  check("pagination meta + 2nd page", p2.json.pagination.current_page === 2 && p2.json.pagination.page_size === 3 && p2.json.pagination.total_records === 4 && p2.json.pagination.total_pages === 2 && p2.json.data.length === 1 && p2.json.data[0].reference_id === "r1", p2.json);
  const beyond = await call("GET", `/api/v1/accounts/${acc.id}/transactions?page=9`, { token: alice.token });
  check("page beyond the end -> empty list", beyond.status === 200 && beyond.json.data.length === 0 && beyond.json.pagination.total_pages === 1, beyond.json);
  const isoTs = all.json.data[0].created_at;
  check("created_at is ISO-8601 UTC", /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(isoTs), isoTs);
  expectError("invalid type filter", await call("GET", `/api/v1/accounts/${acc.id}/transactions?type=transfer`, { token: alice.token }), 400, "INVALID_TRANSACTION_TYPE");
  for (const q of ["page=0", "page=-1", "page=abc", "limit=0", "limit=101", "limit=1.5", "page=99999999999"]) {
    expectError(`invalid pagination (${q})`, await call("GET", `/api/v1/accounts/${acc.id}/transactions?${q}`, { token: alice.token }), 400, "INVALID_PAGINATION");
  }

  console.log("\n[concurrency] parallel writes stay consistent");
  const race = await newAccount(alice.token, "Race");
  await credit(alice.token, race.id, "100", "seed");
  const debits10 = await Promise.all(Array.from({ length: 10 }, (_, i) => tx(alice.token, race.id, { type: "debit", amount: "30", reference_id: `par-${i}` })));
  const okCount = debits10.filter((r) => r.status === 201).length;
  const rejected = debits10.filter((r) => r.status === 422).length;
  check("10 parallel debits of 30 on 100: exactly 3 succeed, 7 rejected", okCount === 3 && rejected === 7, debits10.map((r) => r.status));
  check("balance is 10.00 (never negative)", (await balance(alice.token, race.id)) === "10.00");
  const sameRefRaw = await Promise.all(Array.from({ length: 6 }, () =>
    tx(alice.token, race.id, { type: "credit", amount: "1", reference_id: "same-ref", description: "dup" }),
  ));
  check("6 parallel identical credits: 1 created, 5 duplicates", sameRefRaw.filter((r) => r.status === 201).length === 1 && sameRefRaw.filter((r) => r.status === 409).length === 5, sameRefRaw.map((r) => r.status));
  check("balance counted the reference once (11.00)", (await balance(alice.token, race.id)) === "11.00");
}

async function isolationSuite() {
  console.log("\n[isolation] one user can never see or debit another user's accounts");
  const alice = await newUser("iso_a");
  const bob = await newUser("iso_b");
  const aAcc = await newAccount(alice.token, "Alice private");
  const aAcc2 = await newAccount(alice.token, "Alice second");
  const bAcc = await newAccount(bob.token, "Bob private");
  await credit(alice.token, aAcc.id, "100", "seed");
  await credit(bob.token, bAcc.id, "50", "seed");

  const bobList = await call("GET", "/api/v1/accounts", { token: bob.token });
  check("bob's list contains only bob's account", bobList.json.data.length === 1 && bobList.json.data[0].id === bAcc.id, bobList.json);

  const ownOne = await call("GET", `/api/v1/accounts/${aAcc.id}`, { token: alice.token });
  check("GET /accounts/:id returns the caller's own account", ownOne.status === 200 && ownOne.json.data.id === aAcc.id && ownOne.json.data.name === "Alice private" && ownOne.json.data.balance === "100.00", ownOne.json);
  expectError("bob cannot read alice's account by id", await call("GET", `/api/v1/accounts/${aAcc.id}`, { token: bob.token }), 404, "ACCOUNT_NOT_FOUND");
  expectError("GET /accounts/:id with invalid id", await call("GET", "/api/v1/accounts/not-a-uuid", { token: alice.token }), 400, "INVALID_ACCOUNT_ID");
  expectError("GET /accounts/:id without token", await call("GET", `/api/v1/accounts/${aAcc.id}`), 401, "UNAUTHENTICATED");

  expectError("bob cannot read alice's balance", await call("GET", `/api/v1/accounts/${aAcc.id}/balance`, { token: bob.token }), 404, "ACCOUNT_NOT_FOUND");
  expectError("bob cannot read alice's history", await call("GET", `/api/v1/accounts/${aAcc.id}/transactions`, { token: bob.token }), 404, "ACCOUNT_NOT_FOUND");
  expectError("bob cannot credit alice's account", await tx(bob.token, aAcc.id, { type: "credit", amount: "1", reference_id: "h1" }), 404, "ACCOUNT_NOT_FOUND");
  expectError("bob cannot debit alice's account", await tx(bob.token, aAcc.id, { type: "debit", amount: "1", reference_id: "h2" }), 404, "ACCOUNT_NOT_FOUND");
  expectError("bob cannot transfer out of alice's account", await call("POST", "/api/v1/transfers", { token: bob.token, body: { from_account_id: aAcc.id, to_account_id: bAcc.id, amount: "10", reference_id: "h3" } }), 404, "ACCOUNT_NOT_FOUND");

  // Peer transfer IS allowed: alice → bob.
  const peer = await call("POST", "/api/v1/transfers", {
    token: alice.token,
    body: { from_account_id: aAcc.id, to_account_id: bAcc.id, amount: "10", reference_id: "peer-1", description: "Lunch" },
  });
  check(
    "alice can transfer into bob's account",
    peer.status === 201 && peer.json.data.from_balance === "90.00" && peer.json.data.to_balance === null && peer.json.data.to_is_own === false,
    peer.json,
  );
  check("bob received the peer transfer", (await balance(bob.token, bAcc.id)) === "60.00");
  const lookup = await call("GET", `/api/v1/accounts/lookup/${bAcc.id}`, { token: alice.token });
  check("lookup shows recipient without balance", lookup.status === 200 && lookup.json.data.owner_username === bob.username && lookup.json.data.name === "Bob private" && !("balance" in lookup.json.data), lookup.json);

  const unknown = await call("GET", "/api/v1/accounts/3fa85f64-5717-4562-b3fc-2c963f66afa6/balance", { token: bob.token });
  const foreign = await call("GET", `/api/v1/accounts/${aAcc.id}/balance`, { token: bob.token });
  check("foreign account is indistinguishable from a non-existent one", JSON.stringify(unknown.json) === JSON.stringify(foreign.json));

  console.log("\n[transfers] atomic debit + credit (own accounts + peer)");
  const body = (o = {}) => ({ from_account_id: aAcc.id, to_account_id: aAcc2.id, amount: "30.00", description: "Rent share", reference_id: "xfer-001", ...o });
  await credit(alice.token, aAcc2.id, "50", "seed");
  // aAcc = 90, aAcc2 = 50  ->  transfer 30 => 60 / 80
  const t1 = await call("POST", "/api/v1/transfers", { token: alice.token, body: body() });
  check("transfer 30 from 90/50 -> 60/80", t1.status === 201 && t1.json.data.from_balance === "60.00" && t1.json.data.to_balance === "80.00" && t1.json.data.to_is_own === true, t1.json);
  check("balances persisted", (await balance(alice.token, aAcc.id)) === "60.00" && (await balance(alice.token, aAcc2.id)) === "80.00");
  const hist = await call("GET", `/api/v1/accounts/${aAcc2.id}/transactions?type=credit`, { token: alice.token });
  check("credit leg visible in destination history", hist.json.data[0].amount === "30.00" && hist.json.data[0].transfer_id === t1.json.data.id, hist.json);
  expectError("duplicate transfer reference", await call("POST", "/api/v1/transfers", { token: alice.token, body: body() }), 409, "DUPLICATE_TRANSACTION");
  check("duplicate transfer moved no money", (await balance(alice.token, aAcc.id)) === "60.00" && (await balance(alice.token, aAcc2.id)) === "80.00");
  expectError("transfer exceeding source balance", await call("POST", "/api/v1/transfers", { token: alice.token, body: body({ amount: "1000", reference_id: "xfer-2" }) }), 422, "INSUFFICIENT_BALANCE");
  check("failed transfer fully rolled back", (await balance(alice.token, aAcc.id)) === "60.00" && (await balance(alice.token, aAcc2.id)) === "80.00");
  expectError("same-account transfer", await call("POST", "/api/v1/transfers", { token: alice.token, body: body({ to_account_id: aAcc.id, reference_id: "xfer-3" }) }), 422, "SAME_ACCOUNT_TRANSFER");
  expectError("transfer invalid amount", await call("POST", "/api/v1/transfers", { token: alice.token, body: body({ amount: "0", reference_id: "xfer-4" }) }), 400, "INVALID_AMOUNT");
  expectError("transfer invalid account id", await call("POST", "/api/v1/transfers", { token: alice.token, body: body({ from_account_id: "nope", reference_id: "xfer-5" }) }), 400, "INVALID_ACCOUNT_ID");
  expectError("transfer missing destination", await call("POST", "/api/v1/transfers", { token: alice.token, body: { from_account_id: aAcc.id, amount: "1", reference_id: "xfer-6" } }), 400, "VALIDATION_ERROR");
  expectError("transfer to non-existent account", await call("POST", "/api/v1/transfers", { token: alice.token, body: body({ to_account_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", reference_id: "xfer-7" }) }), 404, "ACCOUNT_NOT_FOUND");

  const opposite = await Promise.all([
    call("POST", "/api/v1/transfers", { token: alice.token, body: body({ amount: "1", reference_id: "opp-1" }) }),
    call("POST", "/api/v1/transfers", { token: alice.token, body: body({ from_account_id: aAcc2.id, to_account_id: aAcc.id, amount: "1", reference_id: "opp-2" }) }),
    call("POST", "/api/v1/transfers", { token: alice.token, body: body({ amount: "1", reference_id: "opp-3" }) }),
    call("POST", "/api/v1/transfers", { token: alice.token, body: body({ from_account_id: aAcc2.id, to_account_id: aAcc.id, amount: "1", reference_id: "opp-4" }) }),
  ]);
  check("opposing concurrent transfers do not deadlock", opposite.every((r) => r.status === 201), opposite.map((r) => r.status));
  const total = Number(await balance(alice.token, aAcc.id)) + Number(await balance(alice.token, aAcc2.id));
  check("money is conserved (60 + 80 = 140)", total === 140, total);
}

async function adminSuite() {
  console.log("\n[admin] env login, list all accounts, credit-only");
  const login = await adminLogin();
  check("admin login -> 200 + token + cookie", login.status === 200 && login.json.data.token.startsWith("lf_") && /lf_admin=/.test(login.headers.get("set-cookie") ?? ""), login.json);
  expectError("admin wrong password", await call("POST", "/api/v1/admin/login", { body: { username: ADMIN_USERNAME, password: "nope-nope-1" } }), 401, "INVALID_CREDENTIALS");
  expectError("admin accounts without token", await call("GET", "/api/v1/admin/accounts"), 401, "UNAUTHENTICATED");

  const user = await newUser("adm");
  const acc = await newAccount(user.token, "Fund me");
  const list = await call("GET", "/api/v1/admin/accounts?limit=100", { token: adminToken });
  check("admin list includes the new account", list.status === 200 && list.json.data.some((a) => a.id === acc.id && a.owner_username === user.username), list.json);

  const credited = await adminCredit(acc.id, "250.50", `admin-${run}`);
  check("admin credit lands", credited.balance === "250.50" && (await balance(user.token, acc.id)) === "250.50", credited);

  // Admin has no withdraw / transfer endpoints — user APIs still reject admin token as a normal session.
  expectError("admin token is not a user session", await call("GET", "/api/v1/accounts", { token: adminToken }), 401, "UNAUTHENTICATED");
  expectError("user token cannot hit admin credit", await call("POST", `/api/v1/admin/accounts/${acc.id}/credit`, {
    token: user.token,
    body: { amount: "1", reference_id: "nope" },
  }), 401, "UNAUTHENTICATED");

  const out = await call("POST", "/api/v1/admin/logout", { token: adminToken });
  check("admin logout -> 200 + clears cookie", out.status === 200 && /lf_admin=;/.test(out.headers.get("set-cookie") ?? ""), out.headers.get("set-cookie"));
  expectError("admin token unusable after logout", await call("GET", "/api/v1/admin/me", { token: adminToken }), 401, "UNAUTHENTICATED");
  adminToken = null; // force re-login if later suites need it
}

async function healthSuite() {
  console.log("\n[health]");
  const res = await call("GET", "/health");
  check("GET /health -> 200 ok/up", res.status === 200 && res.json?.status === "ok" && res.json?.database === "up", res.json);
}

// Page-level gate (proxy.ts): redirects must be inspected, not followed.
async function page(path, cookie) {
  const res = await fetch(BASE + path, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, location: res.headers.get("location"), setCookie: res.headers.get("set-cookie") ?? "" };
}
const redirectsTo = (res, target) => res.status === 307 && new URL(res.location, BASE).pathname === target;

async function pagesSuite() {
  console.log("\n[pages] signed-out visitors always land on /login (proxy.ts)");
  for (const path of ["/", "/dashboard", "/transfer", "/accounts/3fa85f64-5717-4562-b3fc-2c963f66afa6"]) {
    check(`signed out ${path} -> /login`, redirectsTo(await page(path), "/login"));
  }
  check("/login is reachable signed out", (await page("/login")).status === 200);
  check("/register is reachable signed out", (await page("/register")).status === 200);
  check("/admin/login is reachable signed out", (await page("/admin/login")).status === 200);
  check("signed out /admin -> /admin/login", redirectsTo(await page("/admin"), "/admin/login"));
  check("/health stays public", (await page("/health")).status === 200);

  const forged = await page("/dashboard", "lf_session=lf_forged");
  check("forged cookie -> /login", redirectsTo(forged, "/login"));
  check("forged cookie is cleared", /lf_session=;/.test(forged.setCookie), forged.setCookie);

  const user = await newUser("pg");
  const cookie = `lf_session=${user.token}`;
  check("signed in /dashboard is served", (await page("/dashboard", cookie)).status === 200);
  check("signed in /login -> /dashboard", redirectsTo(await page("/login", cookie), "/dashboard"));
  check("signed in /register -> /dashboard", redirectsTo(await page("/register", cookie), "/dashboard"));
  check("signed in / -> /dashboard", redirectsTo(await page("/", cookie), "/dashboard"));

  await call("POST", "/api/v1/auth/logout", { token: user.token });
  check("revoked session -> /login", redirectsTo(await page("/dashboard", cookie), "/login"));
  expectError("API stays JSON 401 (never redirected)", await call("GET", "/api/v1/accounts"), 401, "UNAUTHENTICATED");
}

try {
  await offlineSuite();
  if (!OFFLINE) {
    await pagesSuite();
    await healthSuite();
    await authSuite();
    await accountsSuite();
    await adminSuite();
    await ledgerSuite();
    await isolationSuite();
  }
} catch (error) {
  failed++;
  console.error("\nSuite aborted:", error);
}

console.log(`\n${passed} passed, ${failed} failed${OFFLINE ? " (offline only)" : ""}`);
process.exit(failed === 0 ? 0 : 1);
