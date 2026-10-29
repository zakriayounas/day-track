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

notify pgrst, 'reload schema';
