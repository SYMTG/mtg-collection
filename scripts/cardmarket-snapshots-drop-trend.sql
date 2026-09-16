-- CM Trend turned out not to be useful info — drops it everywhere. The view
-- has to be dropped and recreated (not CREATE OR REPLACE) because Postgres
-- only allows that to append columns, not remove one from the middle.

drop view cardmarket_price_snapshots_latest;

alter table cardmarket_price_snapshots drop column price_trend;

create view cardmarket_price_snapshots_latest as
select distinct on (product_id)
  product_id,
  product_name,
  product_url,
  available_items,
  price_from,
  snapshot_month,
  collected_at
from cardmarket_price_snapshots
order by product_id, snapshot_month desc;

grant select on cardmarket_price_snapshots_latest to anon;
