-- =============================================================================
-- LedgerFlow - initial schema
--
-- Design rules
--   * Every table is in 3NF; every fact is stored once.
--   * accounts.balance is the only derived value (required by the assessment).
--     It can ONLY change as a side effect of inserting a row into
--     public.transactions (AFTER INSERT trigger) - direct edits are rejected.
--   * transactions / transfers are append-only (UPDATE, DELETE, TRUNCATE blocked).
--   * All tables have RLS enabled with NO policies and no grants to anon /
--     authenticated: the tables are reachable only by the server (service_role).
--   * All business operations are SQL functions that receive the authenticated
--     user id and filter by ownership, so one user can never read or move money
--     in another user's account.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.transaction_type as enum ('credit', 'debit');
create type public.login_method     as enum ('password', 'mpin');

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
create table public.users (
  id                    uuid        primary key default gen_random_uuid(),
  username              text        not null,
  password_hash         text        not null,
  mpin_hash             text        not null,
  failed_login_attempts smallint    not null default 0,
  locked_until          timestamptz,
  created_at            timestamptz not null default now(),
  constraint users_username_unique           unique (username),
  constraint users_username_format           check (username ~ '^[a-z0-9_]{3,32}$'),
  constraint users_failed_attempts_not_negative check (failed_login_attempts >= 0)
);

-- -----------------------------------------------------------------------------
-- sessions (opaque bearer tokens; only the SHA-256 of the token is stored)
-- -----------------------------------------------------------------------------
create table public.sessions (
  id           uuid                primary key default gen_random_uuid(),
  user_id      uuid                not null references public.users (id) on delete cascade,
  token_hash   text                not null,
  login_method public.login_method not null,
  created_at   timestamptz         not null default now(),
  expires_at   timestamptz         not null,
  revoked_at   timestamptz,
  constraint sessions_token_hash_unique   unique (token_hash),
  constraint sessions_expires_after_start check (expires_at > created_at)
);
create index sessions_user_id_idx on public.sessions (user_id);

-- -----------------------------------------------------------------------------
-- accounts
-- -----------------------------------------------------------------------------
create table public.accounts (
  id         uuid          primary key default gen_random_uuid(),
  user_id    uuid          not null references public.users (id) on delete restrict,
  name       text          not null,
  balance    numeric(18,2) not null default 0,
  created_at timestamptz   not null default now(),
  constraint accounts_name_not_blank       check (btrim(name) <> '' and char_length(name) <= 255),
  constraint accounts_balance_not_negative check (balance >= 0)
);
create index accounts_user_id_created_at_idx on public.accounts (user_id, created_at desc, id desc);

-- -----------------------------------------------------------------------------
-- transfers (bonus) - one row per money transfer between two accounts
-- The two ledger legs live in public.transactions (transfer_id -> transfers.id)
-- -----------------------------------------------------------------------------
create table public.transfers (
  id              uuid          primary key default gen_random_uuid(),
  from_account_id uuid          not null references public.accounts (id) on delete restrict,
  to_account_id   uuid          not null references public.accounts (id) on delete restrict,
  amount          numeric(18,2) not null,
  description     text,
  reference_id    text          not null,
  created_at      timestamptz   not null default clock_timestamp(),
  constraint transfers_distinct_accounts check (from_account_id <> to_account_id),
  constraint transfers_amount_positive   check (amount > 0),
  constraint transfers_description_len   check (char_length(description) <= 500),
  constraint transfers_reference_valid   check (btrim(reference_id) <> '' and char_length(reference_id) <= 128),
  constraint transfers_reference_unique  unique (from_account_id, reference_id)
);
create index transfers_to_account_id_idx on public.transfers (to_account_id);

-- -----------------------------------------------------------------------------
-- transactions (append-only ledger)
-- clock_timestamp() (not now()) so that created_at reflects the real order in
-- which concurrent transactions were applied after taking the account lock.
-- -----------------------------------------------------------------------------
create table public.transactions (
  id           uuid                    primary key default gen_random_uuid(),
  account_id   uuid                    not null references public.accounts (id) on delete restrict,
  type         public.transaction_type not null,
  amount       numeric(18,2)           not null,
  description  text,
  reference_id text                    not null,
  transfer_id  uuid                    references public.transfers (id) on delete restrict,
  created_at   timestamptz             not null default clock_timestamp(),
  constraint transactions_amount_positive  check (amount > 0),
  constraint transactions_description_len  check (char_length(description) <= 500),
  constraint transactions_reference_valid  check (btrim(reference_id) <> '' and char_length(reference_id) <= 128),
  constraint transactions_reference_unique unique (account_id, reference_id)
);
-- history query: WHERE account_id = ? ORDER BY created_at DESC, id DESC
create index transactions_account_history_idx
  on public.transactions (account_id, created_at desc, id desc);
-- a transfer has at most one debit leg and one credit leg
create unique index transactions_transfer_leg_unique
  on public.transactions (transfer_id, type) where transfer_id is not null;

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------

-- Ledger rows can never be changed or removed.
create function public.reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'TRANSACTION_IMMUTABLE: % on % is not allowed', tg_op, tg_table_name
    using errcode = '55000';
end;
$$;

create trigger transactions_immutable
  before update or delete on public.transactions
  for each row execute function public.reject_ledger_mutation();
create trigger transactions_no_truncate
  before truncate on public.transactions
  for each statement execute function public.reject_ledger_mutation();
create trigger transfers_immutable
  before update or delete on public.transfers
  for each row execute function public.reject_ledger_mutation();
create trigger transfers_no_truncate
  before truncate on public.transfers
  for each statement execute function public.reject_ledger_mutation();

-- The only way a balance changes: a transaction row is inserted.
-- The UPDATE takes the row lock on the account, serialising concurrent writers;
-- accounts_balance_not_negative is the last line of defence against overdraft.
create function public.apply_transaction_to_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.accounts
     set balance = case new.type
                     when 'credit' then balance + new.amount
                     else               balance - new.amount
                   end
   where id = new.account_id;
  return null;
end;
$$;

create trigger transactions_apply_to_balance
  after insert on public.transactions
  for each row execute function public.apply_transaction_to_balance();

-- accounts.id / user_id / created_at are immutable; balance may only be changed
-- from inside the trigger above (trigger depth 2), never by a direct UPDATE.
create function public.guard_account_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.created_at <> old.created_at then
    raise exception 'accounts.id, user_id and created_at are immutable'
      using errcode = '55000';
  end if;
  if new.balance <> old.balance and pg_trigger_depth() < 2 then
    raise exception 'accounts.balance can only change by inserting a transaction'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger accounts_guard
  before update on public.accounts
  for each row execute function public.guard_account_update();

-- -----------------------------------------------------------------------------
-- JSON serialisers (money is always emitted as text to avoid float rounding)
-- -----------------------------------------------------------------------------
create function public.account_json(a public.accounts)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',         a.id,
    'name',       a.name,
    'balance',    a.balance::text,
    'created_at', a.created_at
  );
$$;

create function public.transaction_json(t public.transactions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',           t.id,
    'account_id',   t.account_id,
    'type',         t.type::text,
    'amount',       t.amount::text,
    'description',  t.description,
    'reference_id', t.reference_id,
    'transfer_id',  t.transfer_id,
    'created_at',   t.created_at
  );
$$;

-- -----------------------------------------------------------------------------
-- Business functions
--   Custom SQLSTATEs:  LF001 ACCOUNT_NOT_FOUND   LF002 INSUFFICIENT_BALANCE
--                      LF003 SAME_ACCOUNT_TRANSFER   LF004 INVALID_AMOUNT
-- Every function takes the authenticated p_user_id and only ever touches
-- accounts owned by that user. "Not yours" is indistinguishable from "does not
-- exist" (LF001) so account ids of other users cannot be probed.
-- -----------------------------------------------------------------------------

create function public.create_account(p_user_id uuid, p_name text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_account public.accounts;
begin
  insert into public.accounts (user_id, name)
  values (p_user_id, btrim(p_name))
  returning * into v_account;

  return public.account_json(v_account);
end;
$$;

create function public.list_accounts(p_user_id uuid, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
begin
  select count(*) into v_total from public.accounts where user_id = p_user_id;

  select coalesce(jsonb_agg(s.j order by s.created_at desc, s.id desc), '[]'::jsonb)
    into v_items
    from (
      select a.created_at, a.id, public.account_json(a) as j
        from public.accounts a
       where a.user_id = p_user_id
       order by a.created_at desc, a.id desc
       limit p_limit offset p_offset
    ) s;

  return jsonb_build_object('total_records', v_total, 'items', v_items);
end;
$$;

create function public.get_balance(p_user_id uuid, p_account_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_balance numeric(18,2);
begin
  select balance into v_balance
    from public.accounts
   where id = p_account_id and user_id = p_user_id;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  return jsonb_build_object('account_id', p_account_id, 'balance', v_balance::text);
end;
$$;

create function public.post_transaction(
  p_user_id      uuid,
  p_account_id   uuid,
  p_type         public.transaction_type,
  p_amount       numeric,
  p_description  text,
  p_reference_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_balance numeric(18,2);
  v_tx      public.transactions;
begin
  if p_amount is null or p_amount <= 0 or scale(p_amount) > 2
     or p_amount > 9999999999999999.99 then
    raise exception 'INVALID_AMOUNT' using errcode = 'LF004';
  end if;

  -- Row lock on the (owned) account: serialises concurrent writers.
  select balance into v_balance
    from public.accounts
   where id = p_account_id and user_id = p_user_id
     for update;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  -- Idempotency: same reference_id on the same account => no new row, no balance change.
  select * into v_tx
    from public.transactions
   where account_id = p_account_id and reference_id = p_reference_id;

  if found then
    return jsonb_build_object(
      'outcome',     'duplicate',
      'transaction', public.transaction_json(v_tx)
    );
  end if;

  if p_type = 'debit' and v_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'LF002';
  end if;

  insert into public.transactions (account_id, type, amount, description, reference_id)
  values (p_account_id, p_type, p_amount, p_description, p_reference_id)
  returning * into v_tx;

  -- balance was updated by trigger apply_transaction_to_balance
  select balance into v_balance from public.accounts where id = p_account_id;

  return jsonb_build_object(
    'outcome',     'created',
    'transaction', public.transaction_json(v_tx),
    'balance',     v_balance::text
  );
end;
$$;

create function public.list_transactions(
  p_user_id    uuid,
  p_account_id uuid,
  p_type       public.transaction_type,
  p_limit      integer,
  p_offset     integer
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
begin
  perform 1 from public.accounts where id = p_account_id and user_id = p_user_id;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  select count(*) into v_total
    from public.transactions
   where account_id = p_account_id
     and (p_type is null or type = p_type);

  select coalesce(jsonb_agg(s.j order by s.created_at desc, s.id desc), '[]'::jsonb)
    into v_items
    from (
      select t.created_at, t.id, public.transaction_json(t) as j
        from public.transactions t
       where t.account_id = p_account_id
         and (p_type is null or t.type = p_type)
       order by t.created_at desc, t.id desc
       limit p_limit offset p_offset
    ) s;

  return jsonb_build_object('total_records', v_total, 'items', v_items);
end;
$$;

create function public.transfer_funds(
  p_user_id      uuid,
  p_from_account uuid,
  p_to_account   uuid,
  p_amount       numeric,
  p_description  text,
  p_reference_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_locked       integer;
  v_from_balance numeric(18,2);
  v_to_balance   numeric(18,2);
  v_existing     public.transactions;
  v_transfer     public.transfers;
  v_debit        public.transactions;
  v_credit       public.transactions;
begin
  if p_amount is null or p_amount <= 0 or scale(p_amount) > 2
     or p_amount > 9999999999999999.99 then
    raise exception 'INVALID_AMOUNT' using errcode = 'LF004';
  end if;

  if p_from_account = p_to_account then
    raise exception 'SAME_ACCOUNT_TRANSFER' using errcode = 'LF003';
  end if;

  -- Lock both owned accounts in id order (deadlock-free for opposite transfers).
  select count(*) into v_locked
    from (
      select id
        from public.accounts
       where id in (p_from_account, p_to_account) and user_id = p_user_id
       order by id
         for update
    ) locked;

  if v_locked <> 2 then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  select * into v_existing
    from public.transactions
   where account_id = p_from_account and reference_id = p_reference_id;

  if found then
    return jsonb_build_object(
      'outcome',     'duplicate',
      'transaction', public.transaction_json(v_existing)
    );
  end if;

  select balance into v_from_balance from public.accounts where id = p_from_account;
  if v_from_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'LF002';
  end if;

  insert into public.transfers (from_account_id, to_account_id, amount, description, reference_id)
  values (p_from_account, p_to_account, p_amount, p_description, p_reference_id)
  returning * into v_transfer;

  insert into public.transactions (account_id, type, amount, description, reference_id, transfer_id)
  values (p_from_account, 'debit', p_amount, p_description, p_reference_id, v_transfer.id)
  returning * into v_debit;

  insert into public.transactions (account_id, type, amount, description, reference_id, transfer_id)
  values (p_to_account, 'credit', p_amount, p_description, 'transfer:' || v_transfer.id::text, v_transfer.id)
  returning * into v_credit;

  select balance into v_from_balance from public.accounts where id = p_from_account;
  select balance into v_to_balance   from public.accounts where id = p_to_account;

  return jsonb_build_object(
    'outcome',               'created',
    'id',                    v_transfer.id,
    'from_account_id',       v_transfer.from_account_id,
    'to_account_id',         v_transfer.to_account_id,
    'amount',                v_transfer.amount::text,
    'description',           v_transfer.description,
    'reference_id',          v_transfer.reference_id,
    'created_at',            v_transfer.created_at,
    'from_balance',          v_from_balance::text,
    'to_balance',            v_to_balance::text,
    'debit_transaction_id',  v_debit.id,
    'credit_transaction_id', v_credit.id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Auth functions
-- -----------------------------------------------------------------------------

-- Atomically counts a failed login; 5 consecutive failures lock the user for 15 min.
create function public.record_login_failure(p_user_id uuid)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_locked_until timestamptz;
begin
  update public.users
     set failed_login_attempts = case when failed_login_attempts + 1 >= 5
                                      then 0 else failed_login_attempts + 1 end,
         locked_until          = case when failed_login_attempts + 1 >= 5
                                      then now() + interval '15 minutes' else locked_until end
   where id = p_user_id
  returning locked_until into v_locked_until;

  return v_locked_until;
end;
$$;

-- Success: reset the failure counter and open a session in one transaction.
create function public.create_session(
  p_user_id     uuid,
  p_token_hash  text,
  p_method      public.login_method,
  p_ttl_seconds integer
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_expires_at timestamptz;
begin
  update public.users
     set failed_login_attempts = 0, locked_until = null
   where id = p_user_id;

  insert into public.sessions (user_id, token_hash, login_method, expires_at)
  values (p_user_id, p_token_hash, p_method, now() + make_interval(secs => p_ttl_seconds))
  returning expires_at into v_expires_at;

  return v_expires_at;
end;
$$;

-- Resolve a bearer token (by hash) to its user; NULL when unknown/expired/revoked.
create function public.authenticate_session(p_token_hash text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('session_id', s.id, 'user_id', u.id, 'username', u.username)
    from public.sessions s
    join public.users u on u.id = s.user_id
   where s.token_hash = p_token_hash
     and s.revoked_at is null
     and s.expires_at > now();
$$;

create function public.revoke_session(p_session_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.sessions
     set revoked_at = now()
   where id = p_session_id and revoked_at is null;
$$;

-- health probe
create function public.ping()
returns integer
language sql
stable
set search_path = ''
as $$ select 1; $$;

-- -----------------------------------------------------------------------------
-- Lock-down: RLS on, no policies, no anon/authenticated access.
-- Only the server (service_role, which bypasses RLS) can use tables/functions.
-- -----------------------------------------------------------------------------
alter table public.users        enable row level security;
alter table public.sessions     enable row level security;
alter table public.accounts     enable row level security;
alter table public.transfers    enable row level security;
alter table public.transactions enable row level security;

revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant all     on all tables    in schema public to service_role;
grant execute on all functions in schema public to service_role;
