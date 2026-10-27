import { rpc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { buildPaginationMeta, type PageParams } from "@/lib/pagination";

/**
 * Every function takes the authenticated `userId` and forwards it to the SQL
 * function, which only ever reads or writes accounts owned by that user.
 * "Not yours" and "does not exist" are indistinguishable (ACCOUNT_NOT_FOUND).
 */

export interface Account {
  id: string;
  name: string;
  balance: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  type: "credit" | "debit";
  amount: string;
  description: string | null;
  reference_id: string;
  transfer_id: string | null;
  created_at: string;
}

const iso = (value: string) => new Date(value).toISOString();

const toAccount = (row: Account): Account => ({
  id: row.id,
  name: row.name,
  balance: row.balance,
  created_at: iso(row.created_at),
});

const toTransaction = (row: Transaction): Transaction => ({
  id: row.id,
  account_id: row.account_id,
  type: row.type,
  amount: row.amount,
  description: row.description,
  reference_id: row.reference_id,
  transfer_id: row.transfer_id,
  created_at: iso(row.created_at),
});

function duplicate(existing: Transaction): AppError {
  return new AppError(
    "DUPLICATE_TRANSACTION",
    "A transaction with this reference_id already exists for this account",
    { details: { existing_transaction: toTransaction(existing) } },
  );
}

export async function createAccount(userId: string, name: string) {
  const row = await rpc<Account>("create_account", {
    p_user_id: userId,
    p_name: name,
  });
  return toAccount(row);
}

export async function getAccount(userId: string, accountId: string) {
  const row = await rpc<Account>("get_account", {
    p_user_id: userId,
    p_account_id: accountId,
  });
  return toAccount(row);
}

export async function listAccounts(userId: string, page: PageParams) {
  const result = await rpc<{ total_records: number; items: Account[] }>(
    "list_accounts",
    { p_user_id: userId, p_limit: page.limit, p_offset: page.offset },
  );
  return {
    items: result.items.map(toAccount),
    pagination: buildPaginationMeta(page, result.total_records),
  };
}

export async function getBalance(userId: string, accountId: string) {
  return rpc<{ account_id: string; balance: string }>("get_balance", {
    p_user_id: userId,
    p_account_id: accountId,
  });
}

/** Users may only withdraw (debit). Credits are admin-only. */
export async function withdraw(
  userId: string,
  accountId: string,
  input: {
    amount: string;
    description: string | null;
    reference_id: string;
  },
) {
  const result = await rpc<{
    outcome: "created" | "duplicate";
    transaction: Transaction;
    balance?: string;
  }>("post_transaction", {
    p_user_id: userId,
    p_account_id: accountId,
    p_type: "debit",
    p_amount: input.amount,
    p_description: input.description,
    p_reference_id: input.reference_id,
  });

  if (result.outcome === "duplicate") throw duplicate(result.transaction);
  return { ...toTransaction(result.transaction), balance: result.balance as string };
}

export async function lookupAccount(accountId: string) {
  return rpc<{ id: string; name: string; owner_username: string }>("lookup_account", {
    p_account_id: accountId,
  });
}

export async function listTransactions(
  userId: string,
  accountId: string,
  type: "credit" | "debit" | null,
  page: PageParams,
) {
  const result = await rpc<{ total_records: number; items: Transaction[] }>(
    "list_transactions",
    {
      p_user_id: userId,
      p_account_id: accountId,
      p_type: type,
      p_limit: page.limit,
      p_offset: page.offset,
    },
  );
  return {
    items: result.items.map(toTransaction),
    pagination: buildPaginationMeta(page, result.total_records),
  };
}

export async function transferFunds(
  userId: string,
  input: {
    from_account_id: string;
    to_account_id: string;
    amount: string;
    description: string | null;
    reference_id: string;
  },
) {
  const result = await rpc<
    | { outcome: "duplicate"; transaction: Transaction }
    | ({
        outcome: "created";
        id: string;
        from_account_id: string;
        to_account_id: string;
        amount: string;
        description: string | null;
        reference_id: string;
        created_at: string;
        from_balance: string;
        to_balance: string | null;
        to_is_own: boolean;
        debit_transaction_id: string;
        credit_transaction_id: string;
      })
  >("transfer_funds", {
    p_user_id: userId,
    p_from_account: input.from_account_id,
    p_to_account: input.to_account_id,
    p_amount: input.amount,
    p_description: input.description,
    p_reference_id: input.reference_id,
  });

  if (result.outcome === "duplicate") throw duplicate(result.transaction);

  const { outcome: _outcome, ...transfer } = result;
  void _outcome;
  return { ...transfer, created_at: iso(transfer.created_at) };
}

export interface AdminAccount {
  id: string;
  name: string;
  balance: string;
  created_at: string;
  owner_id: string;
  owner_username: string;
}

const toAdminAccount = (row: AdminAccount): AdminAccount => ({
  ...row,
  created_at: iso(row.created_at),
});

export async function adminListAccounts(page: PageParams) {
  const result = await rpc<{ total_records: number; items: AdminAccount[] }>(
    "admin_list_accounts",
    { p_limit: page.limit, p_offset: page.offset },
  );
  return {
    items: result.items.map(toAdminAccount),
    pagination: buildPaginationMeta(page, result.total_records),
  };
}

export async function adminGetAccount(accountId: string) {
  const row = await rpc<AdminAccount>("admin_get_account", {
    p_account_id: accountId,
  });
  return toAdminAccount(row);
}

export async function adminCredit(
  accountId: string,
  input: { amount: string; description: string | null; reference_id: string },
) {
  const result = await rpc<{
    outcome: "created" | "duplicate";
    transaction: Transaction;
    balance: string;
  }>("admin_credit", {
    p_account_id: accountId,
    p_amount: input.amount,
    p_description: input.description,
    p_reference_id: input.reference_id,
  });

  if (result.outcome === "duplicate") throw duplicate(result.transaction);
  return { ...toTransaction(result.transaction), balance: result.balance };
}
