-- =============================================================================
-- Admin credits + peer-to-peer transfers
--
-- Rules:
--   * Regular users may NOT credit their own accounts (no self-funding).
--   * Regular users may withdraw (debit) their own accounts.
--   * Transfers: source must be the caller's; destination may belong to anyone.
--   * Admin (env credentials, separate session) may ONLY credit any account.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Admin sessions (opaque tokens; only the SHA-256 hash is stored)
-- -----------------------------------------------------------------------------
create table public.admin_sessions (
  id         uuid        primary key default gen_random_uuid(),
  token_hash text        not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint admin_sessions_token_hash_unique   unique (token_hash),
  constraint admin_sessions_expires_after_start check (expires_at > created_at)
);

alter table public.admin_sessions enable row level security;
revoke all on table public.admin_sessions from public, anon, authenticated;
grant all on table public.admin_sessions to service_role;

-- -----------------------------------------------------------------------------
-- Users may no longer self-credit via post_transaction
-- -----------------------------------------------------------------------------
create or replace function public.post_transaction(
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
  -- Self-funding is forbidden. New money enters the system only via admin_credit
  -- (or as the credit leg of a peer transfer).
  if p_type = 'credit' then
    raise exception 'CREDIT_FORBIDDEN' using errcode = 'LF005';
  end if;

  if p_amount is null or p_amount <= 0 or scale(p_amount) > 2
     or p_amount > 9999999999999999.99 then
    raise exception 'INVALID_AMOUNT' using errcode = 'LF004';
  end if;

  select balance into v_balance
    from public.accounts
   where id = p_account_id and user_id = p_user_id
     for update;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  select * into v_tx
    from public.transactions
   where account_id = p_account_id and reference_id = p_reference_id;

  if found then
    return jsonb_build_object(
      'outcome',     'duplicate',
      'transaction', public.transaction_json(v_tx)
    );
  end if;

  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'LF002';
  end if;

  insert into public.transactions (account_id, type, amount, description, reference_id)
  values (p_account_id, p_type, p_amount, p_description, p_reference_id)
  returning * into v_tx;

  select balance into v_balance from public.accounts where id = p_account_id;

  return jsonb_build_object(
    'outcome',     'created',
    'transaction', public.transaction_json(v_tx),
    'balance',     v_balance::text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Peer transfers: destination may belong to any user
-- -----------------------------------------------------------------------------
create or replace function public.transfer_funds(
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
  v_from         public.accounts;
  v_to           public.accounts;
  v_existing     public.transactions;
  v_transfer     public.transfers;
  v_debit        public.transactions;
  v_credit       public.transactions;
  v_first        uuid;
  v_second       uuid;
begin
  if p_amount is null or p_amount <= 0 or scale(p_amount) > 2
     or p_amount > 9999999999999999.99 then
    raise exception 'INVALID_AMOUNT' using errcode = 'LF004';
  end if;

  if p_from_account = p_to_account then
    raise exception 'SAME_ACCOUNT_TRANSFER' using errcode = 'LF003';
  end if;

  -- Lock both accounts in id order (deadlock-free). Source must be the caller's;
  -- destination may belong to anyone.
  if p_from_account < p_to_account then
    v_first := p_from_account; v_second := p_to_account;
  else
    v_first := p_to_account; v_second := p_from_account;
  end if;

  perform 1 from public.accounts where id = v_first for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;
  perform 1 from public.accounts where id = v_second for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  select * into v_from from public.accounts where id = p_from_account;
  select * into v_to   from public.accounts where id = p_to_account;

  if v_from.user_id <> p_user_id then
    -- Source isn't yours → same 404 as a missing account (no ownership leak).
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

  if v_from.balance < p_amount then
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

  select balance into v_from.balance from public.accounts where id = p_from_account;
  select balance into v_to.balance   from public.accounts where id = p_to_account;

  return jsonb_build_object(
    'outcome',               'created',
    'id',                    v_transfer.id,
    'from_account_id',       v_transfer.from_account_id,
    'to_account_id',         v_transfer.to_account_id,
    'amount',                v_transfer.amount::text,
    'description',           v_transfer.description,
    'reference_id',          v_transfer.reference_id,
    'created_at',            v_transfer.created_at,
    'from_balance',          v_from.balance::text,
    -- Only reveal the destination balance when it is also the caller's account.
    'to_balance',            case when v_to.user_id = p_user_id then v_to.balance::text else null end,
    'to_is_own',             (v_to.user_id = p_user_id),
    'debit_transaction_id',  v_debit.id,
    'credit_transaction_id', v_credit.id
  );
end;
$$;

-- Public lookup so a sender can confirm a destination before transferring.
-- Reveals name + owner username only (never the balance).
create function public.lookup_account(p_account_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_row record;
begin
  select a.id, a.name, u.username as owner_username
    into v_row
    from public.accounts a
    join public.users u on u.id = a.user_id
   where a.id = p_account_id;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  return jsonb_build_object(
    'id',             v_row.id,
    'name',           v_row.name,
    'owner_username', v_row.owner_username
  );
end;
$$;

revoke all on function public.lookup_account(uuid) from public, anon, authenticated;
grant execute on function public.lookup_account(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Admin: list every account, credit any account
-- -----------------------------------------------------------------------------
create function public.admin_list_accounts(p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
begin
  select count(*) into v_total from public.accounts;

  select coalesce(jsonb_agg(s.j order by s.created_at desc, s.id desc), '[]'::jsonb)
    into v_items
    from (
      select a.created_at, a.id,
             jsonb_build_object(
               'id',             a.id,
               'name',           a.name,
               'balance',        a.balance::text,
               'created_at',     a.created_at,
               'owner_id',       u.id,
               'owner_username', u.username
             ) as j
        from public.accounts a
        join public.users u on u.id = a.user_id
       order by a.created_at desc, a.id desc
       limit p_limit offset p_offset
    ) s;

  return jsonb_build_object('total_records', v_total, 'items', v_items);
end;
$$;

revoke all on function public.admin_list_accounts(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_accounts(integer, integer) to service_role;

create function public.admin_get_account(p_account_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_row record;
begin
  select a.id, a.name, a.balance, a.created_at, u.id as owner_id, u.username as owner_username
    into v_row
    from public.accounts a
    join public.users u on u.id = a.user_id
   where a.id = p_account_id;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  return jsonb_build_object(
    'id',             v_row.id,
    'name',           v_row.name,
    'balance',        v_row.balance::text,
    'created_at',     v_row.created_at,
    'owner_id',       v_row.owner_id,
    'owner_username', v_row.owner_username
  );
end;
$$;

revoke all on function public.admin_get_account(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_account(uuid) to service_role;

-- The only path that creates new money in the ledger.
create function public.admin_credit(
  p_account_id   uuid,
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

  select balance into v_balance
    from public.accounts
   where id = p_account_id
     for update;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  select * into v_tx
    from public.transactions
   where account_id = p_account_id and reference_id = p_reference_id;

  if found then
    return jsonb_build_object(
      'outcome',     'duplicate',
      'transaction', public.transaction_json(v_tx),
      'balance',     v_balance::text
    );
  end if;

  insert into public.transactions (account_id, type, amount, description, reference_id)
  values (
    p_account_id,
    'credit',
    p_amount,
    coalesce(nullif(btrim(p_description), ''), 'Admin credit'),
    p_reference_id
  )
  returning * into v_tx;

  select balance into v_balance from public.accounts where id = p_account_id;

  return jsonb_build_object(
    'outcome',     'created',
    'transaction', public.transaction_json(v_tx),
    'balance',     v_balance::text
  );
end;
$$;

revoke all on function public.admin_credit(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.admin_credit(uuid, numeric, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Admin session helpers
-- -----------------------------------------------------------------------------
create function public.create_admin_session(p_token_hash text, p_ttl_seconds integer)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_expires timestamptz;
begin
  v_expires := now() + make_interval(secs => p_ttl_seconds);
  insert into public.admin_sessions (token_hash, expires_at)
  values (p_token_hash, v_expires);
  return v_expires;
end;
$$;

create function public.authenticate_admin_session(p_token_hash text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  return exists (
    select 1
      from public.admin_sessions
     where token_hash = p_token_hash
       and revoked_at is null
       and expires_at > now()
  );
end;
$$;

create function public.revoke_admin_session(p_token_hash text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.admin_sessions
     set revoked_at = now()
   where token_hash = p_token_hash
     and revoked_at is null;
end;
$$;

revoke all on function public.create_admin_session(text, integer) from public, anon, authenticated;
revoke all on function public.authenticate_admin_session(text) from public, anon, authenticated;
revoke all on function public.revoke_admin_session(text) from public, anon, authenticated;
grant execute on function public.create_admin_session(text, integer) to service_role;
grant execute on function public.authenticate_admin_session(text) to service_role;
grant execute on function public.revoke_admin_session(text) to service_role;
