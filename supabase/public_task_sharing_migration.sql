-- Apply when the original schema has already been installed.
alter table public.items
  add column if not exists test_steps text not null default '',
  add column if not exists public_token text unique,
  add column if not exists public_enabled boolean not null default false;

create table if not exists public.public_item_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  author_name text not null check (length(trim(author_name)) between 1 and 80),
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists public_item_comments_item_created_idx
  on public.public_item_comments (item_id, created_at);

alter table public.public_item_comments enable row level security;
revoke all on table public.public_item_comments from public, anon, authenticated;

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
    'platform', platform.name,
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
