-- Y-M-S kanban board — run once in Supabase SQL editor.
create table if not exists y_ms_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

alter table y_ms_tasks enable row level security;

-- Site access is already gated by the shared-password cookie at the app layer
-- (see proxy.ts), same as every other table in this project — no per-row auth here.
create policy "y_ms_tasks_anon_all" on y_ms_tasks
  for all
  using (true)
  with check (true);
