alter type public.release_status add value if not exists 'closed';

create or replace function public.prevent_closed_release_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status::text = 'closed' then
    if (to_jsonb(new) - 'public_enabled' - 'public_token' - 'updated_at')
      is distinct from
      (to_jsonb(old) - 'public_enabled' - 'public_token' - 'updated_at') then
      raise exception 'A closed release cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_closed_release_content_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.releases r
      where r.id = old.release_id and r.status::text = 'closed'
    ) then
      raise exception 'Content in a closed release cannot be changed';
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if exists (
      select 1 from public.releases r
      where r.id = old.release_id and r.status::text = 'closed'
    ) then
      raise exception 'Content in a closed release cannot be changed';
    end if;
    if exists (
      select 1 from public.releases r
      where r.id = new.release_id and r.status::text = 'closed'
    ) then
      raise exception 'Content cannot be added to a closed release';
    end if;
    return new;
  else
    if exists (
      select 1 from public.releases r
      where r.id = new.release_id and r.status::text = 'closed'
    ) then
      raise exception 'Content cannot be added to a closed release';
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists releases_prevent_closed_changes on public.releases;
drop trigger if exists release_platforms_prevent_closed_changes on public.release_platforms;
drop trigger if exists release_sql_steps_prevent_closed_changes on public.release_sql_steps;
drop trigger if exists release_checklist_steps_prevent_closed_changes on public.release_checklist_steps;
drop trigger if exists release_updates_prevent_closed_changes on public.release_updates;
drop trigger if exists items_prevent_closed_release_changes on public.items;

create trigger releases_prevent_closed_changes
before update on public.releases
for each row execute function public.prevent_closed_release_changes();

create trigger release_platforms_prevent_closed_changes
before insert or update or delete on public.release_platforms
for each row execute function public.prevent_closed_release_content_changes();
create trigger release_sql_steps_prevent_closed_changes
before insert or update or delete on public.release_sql_steps
for each row execute function public.prevent_closed_release_content_changes();
create trigger release_checklist_steps_prevent_closed_changes
before insert or update or delete on public.release_checklist_steps
for each row execute function public.prevent_closed_release_content_changes();
create trigger release_updates_prevent_closed_changes
before insert or update or delete on public.release_updates
for each row execute function public.prevent_closed_release_content_changes();

create or replace function public.prevent_closed_release_item_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.release_id is not null and exists (
      select 1 from public.releases r
      where r.id = old.release_id and r.status::text = 'closed'
    ) then
      raise exception 'Items cannot be removed from a closed release';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.release_id is distinct from new.release_id
    and old.release_id is not null and exists (
      select 1 from public.releases r
      where r.id = old.release_id and r.status::text = 'closed'
    ) then
    raise exception 'Items cannot be removed from a closed release';
  end if;

  if new.release_id is not null
    and (tg_op = 'INSERT' or old.release_id is distinct from new.release_id)
    and exists (
      select 1 from public.releases r
      where r.id = new.release_id and r.status::text = 'closed'
    ) then
    raise exception 'Items cannot be added to a closed release';
  end if;

  return new;
end;
$$;

create trigger items_prevent_closed_release_changes
before insert or update or delete on public.items
for each row execute function public.prevent_closed_release_item_changes();

create or replace function public.set_release_public_share(release_id uuid, enable_share boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  share_token text;
begin
  if auth.uid() is null or not public.current_user_active() or not public.is_admin() then
    raise exception 'An active admin account is required';
  end if;

  update public.releases
  set public_enabled = enable_share,
      public_token = case
        when enable_share then coalesce(public_token, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
        else null
      end
  where id = release_id
  returning public_token into share_token;

  if not found then
    raise exception 'Release not found or you do not have permission to share it';
  end if;

  return share_token;
end;
$$;

revoke all on function public.set_release_public_share(uuid, boolean) from public;
grant execute on function public.set_release_public_share(uuid, boolean) to authenticated;

create or replace function public.public_release_by_token(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', r.name,
    'status', r.status,
    'target_date', r.target_date,
    'summary', r.summary,
    'release_notes', r.release_notes,
    'platforms', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name) order by p.name)
      from public.release_platforms rp
      join public.platforms p on p.id = rp.platform_id
      where rp.release_id = r.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', i.reference,
        'title', i.title,
        'type', i.type,
        'status', i.status,
        'priority', i.priority,
        'due_date', i.due_date,
        'tags', i.tags,
        'body', i.body,
        'test_steps', i.test_steps,
        'platforms', coalesce((
          select jsonb_agg(p.name order by p.name)
          from public.item_platforms ip
          join public.platforms p on p.id = ip.platform_id
          where ip.item_id = i.id
        ), case when legacy_platform.name is not null then jsonb_build_array(legacy_platform.name) else '[]'::jsonb end)
      ) order by i.sort_order, i.created_at)
      from public.items i
      left join public.platforms legacy_platform on legacy_platform.id = i.platform_id
      where i.release_id = r.id and i.type = 'task'
    ), '[]'::jsonb),
    'sql_queries', coalesce((
      select jsonb_agg(jsonb_build_object('title', s.title, 'sql', s.sql, 'platform', p.name, 'notes', s.notes) order by s.position)
      from public.release_sql_steps s
      left join public.platforms p on p.id = s.platform_id
      where s.release_id = r.id
    ), '[]'::jsonb),
    'pre_steps', coalesce((
      select jsonb_agg(jsonb_build_object('title', c.title) order by c.position)
      from public.release_checklist_steps c where c.release_id = r.id and c.phase = 'pre'
    ), '[]'::jsonb),
    'post_steps', coalesce((
      select jsonb_agg(jsonb_build_object('title', c.title) order by c.position)
      from public.release_checklist_steps c where c.release_id = r.id and c.phase = 'post'
    ), '[]'::jsonb),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object('title', u.title, 'description', u.description, 'platform', p.name, 'type', u.type) order by u.position)
      from public.release_updates u
      left join public.platforms p on p.id = u.platform_id
      where u.release_id = r.id
    ), '[]'::jsonb)
  )
  from public.releases r
  where r.public_token = share_token and r.public_enabled = true
  limit 1;
$$;

revoke all on function public.public_release_by_token(text) from public;
grant execute on function public.public_release_by_token(text) to anon, authenticated;

create or replace function public.create_release_with_platforms(
  release_name text,
  release_target_date date,
  release_summary text,
  release_notes text,
  release_platform_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_release_id uuid;
  selected_platform_count integer;
  available_platform_count integer;
begin
  if auth.uid() is null or not public.current_user_active() or not public.is_admin() then
    raise exception 'An active admin account is required';
  end if;
  if nullif(btrim(release_name), '') is null or length(btrim(release_name)) > 120 then
    raise exception 'Release name must be between 1 and 120 characters';
  end if;

  select count(*) into selected_platform_count
  from (select distinct unnest(coalesce(release_platform_ids, '{}'::uuid[])) as id) selected
  where selected.id is not null;

  select count(*) into available_platform_count
  from public.platforms p
  where p.id = any(coalesce(release_platform_ids, '{}'::uuid[]))
    and p.is_active;

  if selected_platform_count <> available_platform_count then
    raise exception 'One or more selected platforms are unavailable';
  end if;

  insert into public.releases (name, target_date, summary, release_notes, created_by)
  values (
    btrim(release_name),
    release_target_date,
    nullif(btrim(release_summary), ''),
    nullif(btrim($4), ''),
    auth.uid()
  )
  returning id into created_release_id;

  insert into public.release_platforms (release_id, platform_id)
  select created_release_id, selected.id
  from (select distinct unnest(coalesce(release_platform_ids, '{}'::uuid[])) as id) selected
  where selected.id is not null;

  return created_release_id;
end;
$$;

revoke all on function public.create_release_with_platforms(text, date, text, text, uuid[]) from public;
grant execute on function public.create_release_with_platforms(text, date, text, text, uuid[]) to authenticated;

create or replace function public.update_release_details(
  release_uuid uuid,
  release_name text,
  release_target_date date,
  release_summary text,
  release_notes text,
  release_platform_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_platform_count integer;
  available_platform_count integer;
begin
  if auth.uid() is null or not public.current_user_active() or not public.is_admin() then
    raise exception 'An active admin account is required';
  end if;
  if nullif(btrim(release_name), '') is null or length(btrim(release_name)) > 120 then
    raise exception 'Release name must be between 1 and 120 characters';
  end if;
  if not exists (
    select 1 from public.releases r
    where r.id = release_uuid and r.status::text <> 'closed'
  ) then
    raise exception 'Release not found or already closed';
  end if;

  select count(*) into selected_platform_count
  from (select distinct unnest(coalesce(release_platform_ids, '{}'::uuid[])) as id) selected
  where selected.id is not null;

  select count(*) into available_platform_count
  from public.platforms p
  where p.id = any(coalesce(release_platform_ids, '{}'::uuid[]))
    and (p.is_active or exists (
      select 1 from public.release_platforms rp
      where rp.release_id = release_uuid and rp.platform_id = p.id
    ));

  if selected_platform_count <> available_platform_count then
    raise exception 'One or more selected platforms are unavailable';
  end if;

  update public.releases
  set name = btrim(release_name),
      target_date = release_target_date,
      summary = nullif(btrim(release_summary), ''),
      release_notes = nullif(btrim($5), '')
  where id = release_uuid;

  delete from public.release_platforms rp
  where rp.release_id = release_uuid
    and not (rp.platform_id = any(coalesce(release_platform_ids, '{}'::uuid[])));

  insert into public.release_platforms (release_id, platform_id)
  select release_uuid, selected.id
  from (select distinct unnest(coalesce(release_platform_ids, '{}'::uuid[])) as id) selected
  where selected.id is not null
  on conflict (release_id, platform_id) do nothing;
end;
$$;

revoke all on function public.update_release_details(uuid, text, date, text, text, uuid[]) from public;
grant execute on function public.update_release_details(uuid, text, date, text, text, uuid[]) to authenticated;

notify pgrst, 'reload schema';
