-- Apply when the original schema has already been installed.
-- Authenticated users can change only their own display name through this RPC.
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