create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'user');
create type public.item_type as enum ('task', 'issue', 'note', 'meeting_note', 'testing_note', 'release_note');
create type public.item_status as enum ('todo', 'in_progress', 'blocked', 'done');
create type public.item_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.reminder_repeat as enum ('none', 'daily', 'weekly');
create type public.release_status as enum ('planned', 'ready', 'deploying', 'deployed', 'rolled_back', 'closed');
create type public.deploy_status as enum ('pending', 'deployed');
create type public.sql_step_status as enum ('pending', 'executed');
create type public.update_type as enum ('feature', 'improvement', 'fix');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '',
  role public.app_role not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.platforms (name) values ('Admin'), ('Website'), ('Client')
on conflict (name) do nothing;

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_date date,
  status public.release_status not null default 'planned',
  owner_id uuid references public.profiles(id) on delete set null,
  summary text,
  release_notes text,
  public_token text unique,
  public_enabled boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.release_platforms (
  release_id uuid not null references public.releases(id) on delete cascade,
  platform_id uuid not null references public.platforms(id),
  status public.deploy_status not null default 'pending',
  deployed_by uuid references public.profiles(id) on delete set null,
  deployed_at timestamptz,
  primary key (release_id, platform_id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  reference text generated always as ('DT-' || upper(substr(replace(id::text, '-', ''), 1, 6))) stored,
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  test_steps text not null default '',
  type public.item_type not null default 'task',
  status public.item_status not null default 'todo',
  priority public.item_priority not null default 'medium',
  sort_order integer not null default -1,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  due_date date,
  tags text[] not null default '{}',
  release_id uuid references public.releases(id) on delete set null,
  platform_id uuid references public.platforms(id) on delete set null,
  reminder_at timestamptz,
  reminder_repeat public.reminder_repeat not null default 'none',
  reminder_notified_at timestamptz,
  reminder_dismissed_at timestamptz,
  public_token text unique,
  public_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.item_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create table public.item_platforms (
  item_id uuid not null references public.items(id) on delete cascade,
  platform_id uuid not null references public.platforms(id) on delete restrict,
  primary key (item_id, platform_id)
);

create table public.public_item_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  author_name text not null check (length(trim(author_name)) between 1 and 80),
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index public_item_comments_item_created_idx on public.public_item_comments (item_id, created_at);

create table public.release_sql_steps (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  title text not null,
  sql text not null,
  platform_id uuid references public.platforms(id) on delete set null,
  notes text not null default '',
  position integer not null default 0,
  status public.sql_step_status not null default 'pending',
  executed_by uuid references public.profiles(id) on delete set null,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.release_checklist_steps (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  phase text not null check (phase in ('pre', 'post')),
  title text not null,
  position integer not null default 0,
  assignee_id uuid references public.profiles(id) on delete set null,
  is_complete boolean not null default false,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.release_updates (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  title text not null,
  description text not null default '',
  platform_id uuid references public.platforms(id) on delete set null,
  type public.update_type not null default 'feature',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null check (entity_type in ('item', 'release')),
  entity_id uuid not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index items_assignee_status_idx on public.items (assignee_id, status);
create index items_sort_order_idx on public.items (sort_order, created_at desc);
create index items_created_by_idx on public.items (created_by);
create index items_release_idx on public.items (release_id);
create index items_due_date_idx on public.items (due_date) where status <> 'done';
create index items_reminder_due_idx on public.items (reminder_at) where reminder_notified_at is null and reminder_dismissed_at is null;
create index comments_item_created_idx on public.item_comments (item_id, created_at);
create index releases_target_date_idx on public.releases (target_date);
create index release_sql_order_idx on public.release_sql_steps (release_id, position);
create index release_checklist_order_idx on public.release_checklist_steps (release_id, phase, position);
create index release_updates_order_idx on public.release_updates (release_id, position);
create index activity_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.current_user_active()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

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

create or replace function public.update_my_display_name(new_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := btrim(new_display_name);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if normalized_name is null or length(normalized_name) not between 1 and 100 then
    raise exception 'Display name must be between 1 and 100 characters';
  end if;

  update public.profiles
  set display_name = normalized_name
  where id = auth.uid() and is_active;

  if not found then
    raise exception 'Active profile not found';
  end if;
end;
$$;

revoke all on function public.update_my_display_name(text) from public;
grant execute on function public.update_my_display_name(text) to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
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

create trigger items_assign_sort_order before insert on public.items
for each row execute function public.assign_item_sort_order();
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger items_touch_updated_at before update on public.items
for each row execute function public.touch_updated_at();
create trigger releases_touch_updated_at before update on public.releases
for each row execute function public.touch_updated_at();

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

create trigger releases_prevent_closed_changes before update on public.releases
for each row execute function public.prevent_closed_release_changes();
create trigger release_platforms_prevent_closed_changes before insert or update or delete on public.release_platforms
for each row execute function public.prevent_closed_release_content_changes();
create trigger release_sql_steps_prevent_closed_changes before insert or update or delete on public.release_sql_steps
for each row execute function public.prevent_closed_release_content_changes();
create trigger release_checklist_steps_prevent_closed_changes before insert or update or delete on public.release_checklist_steps
for each row execute function public.prevent_closed_release_content_changes();
create trigger release_updates_prevent_closed_changes before insert or update or delete on public.release_updates
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

create trigger items_prevent_closed_release_changes before insert or update or delete on public.items
for each row execute function public.prevent_closed_release_item_changes();

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.platforms enable row level security;
alter table public.releases enable row level security;
alter table public.release_platforms enable row level security;
alter table public.items enable row level security;
alter table public.item_platforms enable row level security;
alter table public.item_comments enable row level security;
alter table public.release_sql_steps enable row level security;
alter table public.release_checklist_steps enable row level security;
alter table public.release_updates enable row level security;
alter table public.activity_log enable row level security;

create policy "Active members can view profiles" on public.profiles
for select to authenticated using (public.current_user_active());
create policy "Admins manage profiles" on public.profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Members can view active platforms" on public.platforms
for select to authenticated using (public.current_user_active());
create policy "Admins manage platforms" on public.platforms
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Members can view releases" on public.releases
for select to authenticated using (public.current_user_active());
create policy "Admins manage releases" on public.releases
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Members can view release platforms" on public.release_platforms
for select to authenticated using (public.current_user_active());
create policy "Admins manage release platforms" on public.release_platforms
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Members can view items" on public.items
for select to authenticated using (public.current_user_active());
create policy "Members can view item platforms" on public.item_platforms
for select to authenticated using (public.current_user_active());
grant select on table public.item_platforms to authenticated;

create or replace function public.update_item_platforms(item_uuid uuid, item_platform_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_platform_count integer;
  active_platform_count integer;
begin
  if auth.uid() is null or not public.current_user_active() then
    raise exception 'An active account is required';
  end if;
  if not exists (
    select 1 from public.items i
    where i.id = item_uuid
      and (public.is_admin() or i.created_by = auth.uid() or i.assignee_id = auth.uid())
  ) then
    raise exception 'You do not have permission to edit this item';
  end if;

  select count(*) into selected_platform_count
  from (select distinct unnest(coalesce(item_platform_ids, '{}'::uuid[])) as id) selected
  where selected.id is not null;

  select count(*) into active_platform_count
  from public.platforms p
  where p.id = any(coalesce(item_platform_ids, '{}'::uuid[]))
    and (p.is_active or exists (
      select 1 from public.item_platforms ip
      where ip.item_id = item_uuid and ip.platform_id = p.id
    ));

  if selected_platform_count <> active_platform_count then
    raise exception 'One or more selected platforms are unavailable';
  end if;

  delete from public.item_platforms where item_id = item_uuid;
  insert into public.item_platforms (item_id, platform_id)
  select item_uuid, selected.id
  from (select distinct unnest(coalesce(item_platform_ids, '{}'::uuid[])) as id) selected
  where selected.id is not null;

  update public.items
  set platform_id = (item_platform_ids)[1]
  where id = item_uuid;
end;
$$;

revoke all on function public.update_item_platforms(uuid, uuid[]) from public;
grant execute on function public.update_item_platforms(uuid, uuid[]) to authenticated;

create policy "Members create items" on public.items
for insert to authenticated with check (
  public.current_user_active() and created_by = auth.uid()
);
create policy "Owners and admins update items" on public.items
for update to authenticated using (
  public.is_admin() or created_by = auth.uid() or assignee_id = auth.uid()
) with check (
  public.is_admin() or created_by = auth.uid() or assignee_id = auth.uid()
);
create policy "Owners and admins delete items" on public.items
for delete to authenticated using (public.is_admin() or created_by = auth.uid());

create policy "Members can view comments" on public.item_comments
for select to authenticated using (public.current_user_active());
create policy "Members add own comments" on public.item_comments
for insert to authenticated with check (public.current_user_active() and author_id = auth.uid());
create policy "Authors update own comments" on public.item_comments
for update to authenticated using (public.current_user_active() and author_id = auth.uid())
with check (public.current_user_active() and author_id = auth.uid());
create policy "Authors delete own comments" on public.item_comments
for delete to authenticated using (public.current_user_active() and author_id = auth.uid());
grant select, insert, update, delete on table public.item_comments to authenticated;

alter table public.public_item_comments enable row level security;
revoke all on table public.public_item_comments from public, anon, authenticated;

create policy "Members view SQL steps" on public.release_sql_steps
for select to authenticated using (public.current_user_active());
create policy "Admins manage SQL steps" on public.release_sql_steps
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Members view checklist steps" on public.release_checklist_steps
for select to authenticated using (public.current_user_active());
create policy "Admins manage checklist steps" on public.release_checklist_steps
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Members view release updates" on public.release_updates
for select to authenticated using (public.current_user_active());
create policy "Admins manage release updates" on public.release_updates
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Members view activity" on public.activity_log
for select to authenticated using (public.current_user_active());
create policy "Members add own activity" on public.activity_log
for insert to authenticated with check (public.current_user_active() and actor_id = auth.uid());

create or replace function public.public_release_by_token(share_token text)
returns jsonb
language sql stable security definer
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
      from public.release_platforms rp join public.platforms p on p.id = rp.platform_id
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
          select jsonb_agg(item_platform.name order by item_platform.name)
          from public.item_platforms ip
          join public.platforms item_platform on item_platform.id = ip.platform_id
          where ip.item_id = i.id
        ), case when legacy_platform.name is not null then jsonb_build_array(legacy_platform.name) else '[]'::jsonb end)
      ) order by i.sort_order, i.created_at)
      from public.items i
      left join public.platforms legacy_platform on legacy_platform.id = i.platform_id
      where i.release_id = r.id and i.type = 'task'
    ), '[]'::jsonb),
    'sql_queries', coalesce((
      select jsonb_agg(jsonb_build_object('title', s.title, 'sql', s.sql, 'platform', p.name, 'notes', s.notes) order by s.position)
      from public.release_sql_steps s left join public.platforms p on p.id = s.platform_id
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
      from public.release_updates u left join public.platforms p on p.id = u.platform_id
      where u.release_id = r.id
    ), '[]'::jsonb)
  )
  from public.releases r
  where r.public_token = share_token and r.public_enabled = true
  limit 1;
$$;

revoke all on function public.public_release_by_token(text) from public;
grant execute on function public.public_release_by_token(text) to anon, authenticated;

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

create or replace function public.set_item_public_share(item_id uuid, enable_share boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  share_token text;
begin
  if auth.uid() is null or not public.current_user_active() then
    raise exception 'An active account is required';
  end if;

  update public.items
  set public_enabled = enable_share,
      public_token = case
        when enable_share then coalesce(public_token, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
        else null
      end
  where id = item_id
    and type = 'task'
    and (public.is_admin() or created_by = auth.uid() or assignee_id = auth.uid())
  returning public_token into share_token;

  if not found then
    raise exception 'Task not found or you do not have permission to share it';
  end if;

  return share_token;
end;
$$;

revoke all on function public.set_item_public_share(uuid, boolean) from public;
grant execute on function public.set_item_public_share(uuid, boolean) to authenticated;

create or replace function public.public_item_by_token(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reference', i.reference,
    'title', i.title,
    'type', i.type,
    'status', i.status,
    'priority', i.priority,
    'due_date', i.due_date,
    'tags', i.tags,
    'body', i.body,
    'test_steps', i.test_steps,
    'created_at', i.created_at,
    'updated_at', i.updated_at,
    'reminder_at', i.reminder_at,
    'reminder_repeat', i.reminder_repeat,
    'assignee', assignee.display_name,
    'creator', creator.display_name,
    'release', r.name,
    'platforms', coalesce((
      select jsonb_agg(p.name order by p.name)
      from public.item_platforms ip
      join public.platforms p on p.id = ip.platform_id
      where ip.item_id = i.id
    ), case when platform.name is not null then jsonb_build_array(platform.name) else '[]'::jsonb end),
    'comments', coalesce((
      select jsonb_agg(comment_data.entry order by comment_data.created_at)
      from (
        select jsonb_build_object(
          'id', c.id,
          'author_name', p.display_name,
          'body', c.body,
          'created_at', c.created_at
        ) as entry, c.created_at
        from public.item_comments c
        join public.profiles p on p.id = c.author_id
        where c.item_id = i.id
        union all
        select jsonb_build_object(
          'id', c.id,
          'author_name', c.author_name,
          'body', c.body,
          'created_at', c.created_at
        ) as entry, c.created_at
        from public.public_item_comments c
        where c.item_id = i.id
      ) comment_data
    ), '[]'::jsonb)
  )
  from public.items i
  left join public.profiles assignee on assignee.id = i.assignee_id
  left join public.profiles creator on creator.id = i.created_by
  left join public.releases r on r.id = i.release_id
  left join public.platforms platform on platform.id = i.platform_id
  where i.public_token = share_token and i.public_enabled = true and i.type = 'task'
  limit 1;
$$;

revoke all on function public.public_item_by_token(text) from public;
grant execute on function public.public_item_by_token(text) to anon, authenticated;

create or replace function public.add_public_item_comment(share_token text, guest_name text, comment_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_uuid uuid;
  comment_row public.public_item_comments;
  normalized_name text := btrim(guest_name);
  normalized_body text := btrim(comment_body);
begin
  if length(share_token) < 64 or length(share_token) > 128 then
    raise exception 'Invalid public task link';
  end if;
  if normalized_name is null or length(normalized_name) not between 1 and 80 then
    raise exception 'Name must be between 1 and 80 characters';
  end if;
  if normalized_body is null or length(normalized_body) not between 1 and 5000 then
    raise exception 'Comment must be between 1 and 5000 characters';
  end if;

  select i.id into item_uuid
  from public.items i
  where i.public_token = share_token and i.public_enabled = true and i.type = 'task';

  if item_uuid is null then
    raise exception 'This public task link is no longer available';
  end if;

  insert into public.public_item_comments (item_id, author_name, body)
  values (item_uuid, normalized_name, normalized_body)
  returning * into comment_row;

  return jsonb_build_object(
    'id', comment_row.id,
    'author_name', comment_row.author_name,
    'body', comment_row.body,
    'created_at', comment_row.created_at
  );
end;
$$;

revoke all on function public.add_public_item_comment(text, text, text) from public;
grant execute on function public.add_public_item_comment(text, text, text) to anon, authenticated;

create or replace function public.public_item_comments_for_item(item_uuid uuid)
returns table (id uuid, item_id uuid, author_name text, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.current_user_active() then
    raise exception 'An active account is required';
  end if;

  if not exists (
    select 1 from public.items i
    where i.id = item_uuid and i.type = 'task'
  ) then
    raise exception 'Task not found';
  end if;

  return query
  select c.id, c.item_id, c.author_name, c.body, c.created_at
  from public.public_item_comments c
  where c.item_id = item_uuid
  order by c.created_at;
end;
$$;

revoke all on function public.public_item_comments_for_item(uuid) from public, anon;
grant execute on function public.public_item_comments_for_item(uuid) to authenticated;

create table public.workspace_settings (
  id smallint primary key default 1 check (id = 1),
  demo_loaded_at timestamptz,
  demo_loaded_by uuid references public.profiles(id) on delete set null,
  demo_prompt_dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.workspace_settings (id) values (1)
on conflict (id) do nothing;

alter table public.workspace_settings enable row level security;
revoke all on public.workspace_settings from anon, authenticated;
grant select on public.workspace_settings to authenticated;
create policy "Active members can view workspace settings" on public.workspace_settings
for select to authenticated using (public.current_user_active());

create or replace function public.load_demo_data_once()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  release_uuid uuid;
  admin_platform uuid;
  website_platform uuid;
  client_platform uuid;
begin
  if actor is null or not public.is_admin() then
    raise exception 'Only an active admin can load demo data';
  end if;

  perform 1 from public.workspace_settings where id = 1 for update;
  if not found then
    raise exception 'Workspace settings row is missing';
  end if;
  if (select demo_loaded_at from public.workspace_settings where id = 1) is not null then
    raise exception 'Demo data has already been loaded for this workspace';
  end if;

  insert into public.releases (name, target_date, status, owner_id, summary, release_notes, created_by)
  values (
    'v2.8.0 · October release',
    current_date + 4,
    'planned',
    actor,
    'Ship the team invite flow, dashboard improvements, and stability fixes.',
    'A focused release for team onboarding, dashboard performance, and session reliability.',
    actor
  )
  returning id into release_uuid;

  select id into admin_platform from public.platforms where name = 'Admin';
  select id into website_platform from public.platforms where name = 'Website';
  select id into client_platform from public.platforms where name = 'Client';

  insert into public.release_platforms (release_id, platform_id)
  select release_uuid, id from public.platforms where name in ('Admin', 'Website', 'Client');

  insert into public.release_sql_steps (release_id, title, sql, platform_id, notes, position)
  values (release_uuid, 'Add team invitations index',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_invites_email ON team_invites(email);',
    website_platform, 'Run before deploying the Website platform.', 0);

  insert into public.release_checklist_steps (release_id, phase, title, position, assignee_id, is_complete, completed_by, completed_at)
  values
    (release_uuid, 'pre', 'Feature freeze', 0, actor, true, actor, now()),
    (release_uuid, 'pre', 'QA sign-off', 1, actor, false, null, null),
    (release_uuid, 'pre', 'Update environment variables', 2, actor, false, null, null),
    (release_uuid, 'pre', 'Take database backup', 3, actor, false, null, null),
    (release_uuid, 'post', 'Verify production health', 0, actor, false, null, null),
    (release_uuid, 'post', 'Post release announcement', 1, actor, false, null, null);

  insert into public.release_updates (release_id, title, description, platform_id, type, position)
  values
    (release_uuid, 'Team invitations', 'Invite teammates with a secure, one-click email link.', website_platform, 'feature', 0),
    (release_uuid, 'Faster dashboard loading', 'Optimized first paint and data hydration.', admin_platform, 'improvement', 1),
    (release_uuid, 'Session refresh reliability', 'Prevented sign-out on long-running sessions.', client_platform, 'fix', 2);

  insert into public.items (title, body, type, status, priority, assignee_id, created_by, due_date, tags, release_id)
  values
    ('Review onboarding flow edge cases', 'Check invite, expired-link, and first-run states before release.', 'task', 'in_progress', 'high', actor, actor, current_date, array['product','web'], release_uuid),
    ('Blank state flashes on slow connections', 'The empty dashboard flashes before cached items load.', 'issue', 'todo', 'urgent', actor, actor, current_date, array['bug','web'], release_uuid),
    ('API response time on project view', 'Review the query plan and reduce the project-view response time.', 'task', 'blocked', 'medium', actor, actor, current_date + 2, array['api'], release_uuid),
    ('Sprint planning notes', 'Keep the release scope narrow and stabilize dashboard loading.', 'meeting_note', 'done', 'low', actor, actor, current_date, array['team'], release_uuid),
    ('Test invite links on mobile Safari', 'Verify link handoff from email and in-app browser.', 'testing_note', 'todo', 'medium', actor, actor, current_date + 1, array['qa','mobile'], release_uuid);

  update public.workspace_settings
  set demo_loaded_at = now(), demo_loaded_by = actor
  where id = 1;

  return jsonb_build_object('release_id', release_uuid, 'demo_loaded_at', now());
end;
$$;

revoke all on function public.load_demo_data_once() from public;
grant execute on function public.load_demo_data_once() to authenticated;

create or replace function public.dismiss_demo_prompt_once()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an active admin can dismiss workspace setup';
  end if;

  update public.workspace_settings
  set demo_prompt_dismissed_at = now()
  where id = 1
    and demo_loaded_at is null
    and demo_prompt_dismissed_at is null;

  if not found and not exists (select 1 from public.workspace_settings where id = 1) then
    raise exception 'Workspace settings row is missing';
  end if;
end;
$$;

revoke all on function public.dismiss_demo_prompt_once() from public;
grant execute on function public.dismiss_demo_prompt_once() to authenticated;

-- Promote the first profile after signing up:
-- update public.profiles set role = 'admin' where id = 'AUTH_USER_UUID';
