create table if not exists public.workspace_settings (
  id smallint primary key default 1 check (id = 1),
  demo_loaded_at timestamptz,
  demo_loaded_by uuid references public.profiles(id) on delete set null,
  demo_prompt_dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.workspace_settings
  add column if not exists demo_prompt_dismissed_at timestamptz;

insert into public.workspace_settings (id) values (1)
on conflict (id) do nothing;

alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

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
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name;
  return new;
end;
$$;

alter table public.workspace_settings enable row level security;
revoke all on public.workspace_settings from anon, authenticated;
grant select on public.workspace_settings to authenticated;

drop policy if exists "Active members can view workspace settings" on public.workspace_settings;
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
