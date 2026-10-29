-- Apply when the original schema has already been installed.
alter table public.items
  add column if not exists test_steps text not null default '';
