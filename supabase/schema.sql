create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'user');
create type public.item_type as enum ('task', 'issue', 'note', 'meeting_note', 'testing_note', 'release_note');
create type public.item_status as enum ('todo', 'in_progress', 'blocked', 'done');
create type public.item_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.reminder_repeat as enum ('none', 'daily', 'weekly');
create type public.release_status as enum ('planned', 'ready', 'deploying', 'deployed', 'rolled_back');
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
  type public.item_type not null default 'task',
  status public.item_status not null default 'todo',
  priority public.item_priority not null default 'medium',
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

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger items_touch_updated_at before update on public.items
for each row execute function public.touch_updated_at();
create trigger releases_touch_updated_at before update on public.releases
for each row execute function public.touch_updated_at();

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
set search_path = public
as $$
  select jsonb_build_object(
    'name', r.name,
    'target_date', r.target_date,
    'summary', r.summary,
    'release_notes', r.release_notes,
    'platforms', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name) order by p.name)
      from public.release_platforms rp join public.platforms p on p.id = rp.platform_id
      where rp.release_id = r.id
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

create table public.workspace_settings (
  id smallint primary key default 1 check (id = 1),
  demo_loaded_at timestamptz,
  demo_loaded_by uuid references public.profiles(id) on delete set null,
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

-- Promote the first profile after signing up:
-- update public.profiles set role = 'admin' where id = 'AUTH_USER_UUID';
