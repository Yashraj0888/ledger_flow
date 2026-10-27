-- Restore user-initiated credits on post_transaction (assessment §2).
-- Admin credit remains available as an optional extra path.

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
