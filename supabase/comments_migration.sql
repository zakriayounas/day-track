-- Apply when the original schema has already been installed.
-- Only each comment's author may update or delete their own comment.
drop policy if exists "Authors and admins delete comments" on public.item_comments;
drop policy if exists "Authors update own comments" on public.item_comments;
drop policy if exists "Authors delete own comments" on public.item_comments;

create policy "Authors update own comments" on public.item_comments
for update to authenticated using (public.current_user_active() and author_id = auth.uid())
with check (public.current_user_active() and author_id = auth.uid());

create policy "Authors delete own comments" on public.item_comments
for delete to authenticated using (public.current_user_active() and author_id = auth.uid());

grant select, insert, update, delete on table public.item_comments to authenticated;
