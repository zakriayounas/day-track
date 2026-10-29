do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'items'
      and column_name = 'sort_order'
  ) then
    alter table public.items add column sort_order integer not null default -1;
    with ranked_items as (
      select id, row_number() over (order by created_at desc, id) - 1 as position
      from public.items
    )
    update public.items i
    set sort_order = ranked_items.position
    from ranked_items
    where i.id = ranked_items.id;
  end if;
end;
$$;

alter table public.items alter column sort_order set default -1;
create index if not exists items_sort_order_idx on public.items (sort_order, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'sort_order' - 'updated_at') is distinct from (to_jsonb(old) - 'sort_order' - 'updated_at') then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.assign_item_sort_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sort_order < 0 then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.items.sort_order'));
    select coalesce(max(i.sort_order) + 1, 0)
    into new.sort_order
    from public.items i;
  end if;
  return new;
end;
$$;

drop trigger if exists items_assign_sort_order on public.items;
create trigger items_assign_sort_order before insert on public.items
for each row execute function public.assign_item_sort_order();

create or replace function public.create_item_with_platforms(
  item_title text,
  item_type public.item_type,
  item_body text,
  item_test_steps text,
  item_priority public.item_priority,
  item_assignee_id uuid,
  item_release_id uuid,
  item_platform_ids uuid[],
  item_reminder_at timestamptz,
  item_reminder_repeat public.reminder_repeat
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_item public.items%rowtype;
  selected_platform_count integer;
  active_platform_count integer;
begin
  if auth.uid() is null or not public.current_user_active() then
    raise exception 'An active account is required';
  end if;
  if btrim(item_title) is null or length(btrim(item_title)) = 0 then
    raise exception 'Item title is required';
  end if;

  select count(*) into selected_platform_count
  from (select distinct unnest(coalesce(item_platform_ids, '{}'::uuid[])) as id) selected
  where selected.id is not null;

  select count(*) into active_platform_count
  from public.platforms p
  where p.id = any(coalesce(item_platform_ids, '{}'::uuid[])) and p.is_active;

  if selected_platform_count <> active_platform_count then
    raise exception 'One or more selected platforms are unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.items.sort_order'));

  insert into public.items (
    title, type, body, test_steps, priority, assignee_id, created_by,
    release_id, platform_id, reminder_at, reminder_repeat, sort_order
  ) values (
    btrim(item_title), item_type, coalesce(item_body, ''), coalesce(item_test_steps, ''),
    item_priority, item_assignee_id, auth.uid(), item_release_id,
    (item_platform_ids)[1], item_reminder_at, coalesce(item_reminder_repeat, 'none'),
    coalesce((select max(sort_order) + 1 from public.items), 0)
  )
  returning * into created_item;

  insert into public.item_platforms (item_id, platform_id)
  select created_item.id, selected.id
  from (select distinct unnest(coalesce(item_platform_ids, '{}'::uuid[])) as id) selected
  where selected.id is not null;

  return to_jsonb(created_item);
end;
$$;

revoke all on function public.create_item_with_platforms(text, public.item_type, text, text, public.item_priority, uuid, uuid, uuid[], timestamptz, public.reminder_repeat) from public;
grant execute on function public.create_item_with_platforms(text, public.item_type, text, text, public.item_priority, uuid, uuid, uuid[], timestamptz, public.reminder_repeat) to authenticated;

create or replace function public.reorder_items(ordered_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_count integer;
  ordered_count integer;
  unique_ordered_count integer;
begin
  if auth.uid() is null or not public.current_user_active() then
    raise exception 'An active account is required';
  end if;
  if ordered_item_ids is null then
    raise exception 'An item order is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.items.sort_order'));

  select count(*) into item_count from public.items;
  select count(*), count(distinct item_id) into ordered_count, unique_ordered_count
  from unnest(ordered_item_ids) as provided(item_id);

  if ordered_count <> item_count or unique_ordered_count <> item_count
    or exists (
      select 1 from unnest(ordered_item_ids) as provided(item_id)
      where not exists (select 1 from public.items i where i.id = provided.item_id)
    ) then
    raise exception 'The item order is stale; refresh the workspace and try again';
  end if;

  update public.items i
  set sort_order = ordered.ordinality - 1
  from unnest(ordered_item_ids) with ordinality as ordered(item_id, ordinality)
  where i.id = ordered.item_id;
end;
$$;

revoke all on function public.reorder_items(uuid[]) from public;
grant execute on function public.reorder_items(uuid[]) to authenticated;

notify pgrst, 'reload schema';
