-- Real name (display name) for users, separate from login username.

alter table public.users
  add column if not exists name text;

-- Existing rows: fall back to username so the column can be NOT NULL.
update public.users
   set name = username
 where name is null or btrim(name) = '';

alter table public.users
  alter column name set not null;

alter table public.users
  drop constraint if exists users_name_not_blank;

alter table public.users
  add constraint users_name_not_blank
  check (btrim(name) <> '' and char_length(name) <= 80);

-- Session payload now includes the display name for /auth/me and the UI.
create or replace function public.authenticate_session(p_token_hash text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'session_id', s.id,
           'user_id',    u.id,
           'username',   u.username,
           'name',       u.name
         )
    from public.sessions s
    join public.users u on u.id = s.user_id
   where s.token_hash = p_token_hash
     and s.revoked_at is null
     and s.expires_at > now();
$$;

-- Peer lookup: show the owner's real name (still never the balance).
create or replace function public.lookup_account(p_account_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_row record;
begin
  select a.id, a.name, u.username as owner_username, u.name as owner_name
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
    'owner_username', v_row.owner_username,
    'owner_name',     v_row.owner_name
  );
end;
$$;

-- Admin account list: include owner display name.
create or replace function public.admin_list_accounts(p_limit integer, p_offset integer)
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
               'owner_username', u.username,
               'owner_name',     u.name
             ) as j
        from public.accounts a
        join public.users u on u.id = a.user_id
       order by a.created_at desc, a.id desc
       limit p_limit offset p_offset
    ) s;

  return jsonb_build_object('total_records', v_total, 'items', v_items);
end;
$$;

create or replace function public.admin_get_account(p_account_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_row record;
begin
  select a.id,
         a.name,
         a.balance::text as balance,
         a.created_at,
         a.user_id as owner_id,
         u.username as owner_username,
         u.name as owner_name
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
    'balance',        v_row.balance,
    'created_at',     v_row.created_at,
    'owner_id',       v_row.owner_id,
    'owner_username', v_row.owner_username,
    'owner_name',     v_row.owner_name
  );
end;
$$;
