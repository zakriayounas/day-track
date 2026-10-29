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
