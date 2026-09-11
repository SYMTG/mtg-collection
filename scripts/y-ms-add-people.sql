-- Y-M-S kanban board — adds author/assignee. Run once in Supabase SQL editor.
alter table y_ms_tasks add column if not exists author text;
alter table y_ms_tasks add column if not exists assignee text;
