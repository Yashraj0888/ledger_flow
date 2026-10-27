-- Fetch one account owned by the caller. A foreign or missing id is the same
-- error (LF001 ACCOUNT_NOT_FOUND) so ids of other users cannot be probed.
create function public.get_account(p_user_id uuid, p_account_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_account public.accounts;
begin
  select * into v_account
    from public.accounts
   where id = p_account_id and user_id = p_user_id;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'LF001';
  end if;

  return public.account_json(v_account);
end;
$$;

revoke all on function public.get_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_account(uuid, uuid) to service_role;
