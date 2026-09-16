-- Таблица для ручных снимков цен с Cardmarket, собираемых userscript'ом
-- (userscripts/cardmarket-price-snapshot.user.js). Один ряд = один клик
-- "Save snapshot" на конкретной странице продукта в конкретный момент.
--
-- Отдельно от sealed_price_history (та таблица — годовая история цены
-- по позициям из sealed.ods, другой источник и другая гранулярность).

create table cardmarket_price_snapshots (
  id bigint generated always as identity primary key,
  product_name text not null,
  product_url text not null,
  available_items integer,
  price_from numeric(10, 2),
  price_trend numeric(10, 2),
  collected_at timestamptz not null default now()
);

-- Даёт анонимному ключу (тому же NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
-- что уже использует сайт и будет использовать userscript) право читать
-- и добавлять записи. Если у остальных таблиц проекта включены RLS-policy —
-- сверьтесь с ними в дашборде и приведите к тому же виду; если RLS нигде
-- не включён (как было исторически — сайт без личных логинов), этого
-- достаточно.
grant select, insert on cardmarket_price_snapshots to anon;
grant usage on sequence cardmarket_price_snapshots_id_seq to anon;
