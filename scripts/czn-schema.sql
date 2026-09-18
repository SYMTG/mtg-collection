-- Таблицы для раздела /czn (Chaos Zero Nightmare — личный ростер и экономика аккаунта).
-- Тот же Supabase-проект, что и MTG-раздел, просто новые таблицы. Без RLS —
-- как и у остальных таблиц проекта, доступ идёт через анонимный публичный ключ
-- (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), сайт закрыт общим паролем на уровне мидлвари.

-- Каталог агентов игры: то, что не меняется от факта обладания агентом.
create table czn_agents (
  id bigint generated always as identity primary key,
  name text not null unique,
  class text not null,
  role text not null,
  attribute text not null,
  rarity smallint not null,
  created_at timestamptz not null default now()
);

-- Мой трекинг по агенту — отдельно от каталога, по аналогии с sealed_products/sealed_items.
-- Одна строка на агента (создаётся вместе с ним при импорте/добавлении).
create table czn_roster (
  id bigint generated always as identity primary key,
  agent_id bigint not null unique references czn_agents(id) on delete cascade,
  owned boolean not null default false,
  tier text,
  level smallint,
  ego smallint,
  potential text,
  signature_partner text,
  equipment text,
  save_date text,
  updated_at timestamptz not null default now()
);

-- Снимки экономики аккаунта — прямое зеркало "Истории накоплений" из Economic.md.
-- combatants/selector/ego_stone не велись исторически по датам, поэтому nullable —
-- заполнены только у самой свежей записи, которую и показывают панельки на странице.
create table czn_economy_snapshots (
  id bigint generated always as identity primary key,
  snapshot_date date not null unique,
  crystals integer not null,
  lb_pulls integer not null,
  lb_pity smallint,
  lb_guaranteed boolean not null default false,
  sb_pulls integer not null,
  sb_pity smallint,
  combatants_owned smallint,
  combatants_total smallint,
  selector smallint,
  ego_stone smallint,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on czn_agents to anon;
grant select, insert, update, delete on czn_roster to anon;
grant select, insert, update, delete on czn_economy_snapshots to anon;

grant usage on sequence czn_agents_id_seq to anon;
grant usage on sequence czn_roster_id_seq to anon;
grant usage on sequence czn_economy_snapshots_id_seq to anon;
