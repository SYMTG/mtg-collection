-- Two changes to cardmarket_price_snapshots (run after cardmarket-snapshots-schema.sql):
--
-- 1. Link each snapshot to the matching row in sealed_products via a real
--    foreign key, instead of only keeping the free-text product name.
-- 2. Enforce at most one snapshot per product per calendar month — the
--    userscript now upserts on (product_id, snapshot_month), so re-saving
--    within the same month overwrites the existing row instead of adding
--    a new one.

alter table cardmarket_price_snapshots
  add column if not exists product_id uuid references sealed_products(id),
  add column if not exists snapshot_month date not null default date_trunc('month', now())::date;

-- The earlier test rows (Mercadian Masques, saved before this migration
-- existed) have no product_id and would fail the NOT NULL step below —
-- delete them, since they were only parsing tests, not real data:
delete from cardmarket_price_snapshots where product_id is null;

alter table cardmarket_price_snapshots
  alter column product_id set not null;

alter table cardmarket_price_snapshots
  add constraint cardmarket_price_snapshots_product_month_key unique (product_id, snapshot_month);

-- sealed_products already has select/insert grants to anon from the existing
-- app; the userscript upserts into it the same way src/app/mtg/sealed/page.tsx
-- does, so no extra grants needed there.
