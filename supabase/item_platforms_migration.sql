create table if not exists public.item_platforms (
  item_id uuid not null references public.items(id) on delete cascade,
  platform_id uuid not null references public.platforms(id) on delete restrict,
  primary key (item_id, platform_id)
);

insert into public.item_platforms (item_id, platform_id)
select id, platform_id
from public.items
where platform_id is not null
on conflict (item_id, platform_id) do nothing;

alter table public.item_platforms enable row level security;
drop policy if exists "Members can view item platforms" on public.item_platforms;
create policy "Members can view item platforms" on public.item_platforms
for select to authenticated using (public.current_user_active());
grant select on table public.item_platforms to authenticated;

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

  insert into public.items (
    title, type, body, test_steps, priority, assignee_id, created_by,
    release_id, platform_id, reminder_at, reminder_repeat
  ) values (
    btrim(item_title), item_type, coalesce(item_body, ''), coalesce(item_test_steps, ''),
    item_priority, item_assignee_id, auth.uid(), item_release_id,
    (item_platform_ids)[1], item_reminder_at, coalesce(item_reminder_repeat, 'none')
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
    ), case when legacy_platform.name is not null then jsonb_build_array(legacy_platform.name) else '[]'::jsonb end),
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
  left join public.platforms legacy_platform on legacy_platform.id = i.platform_id
  where i.public_token = share_token and i.public_enabled = true and i.type = 'task'
  limit 1;
$$;

revoke all on function public.public_item_by_token(text) from public;
grant execute on function public.public_item_by_token(text) to anon, authenticated;

notify pgrst, 'reload schema';
