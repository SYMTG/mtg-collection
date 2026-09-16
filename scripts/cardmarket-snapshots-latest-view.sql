-- Fixes the row-cap problem the hard way: instead of fetching every monthly
-- snapshot for every product on every page load (grows forever, eventually
-- hits Supabase's default row cap again no matter how high you set .limit()),
-- the table's CM Qty/Min/Trend columns now read from this view, which is
-- bounded by the number of PRODUCTS (grows rarely), not the number of
-- snapshots (grows every month, forever).

create view cardmarket_price_snapshots_latest as
select distinct on (product_id)
  product_id,
  product_name,
  product_url,
  available_items,
  price_from,
  price_trend,
  snapshot_month,
  collected_at
from cardmarket_price_snapshots
order by product_id, snapshot_month desc;

grant select on cardmarket_price_snapshots_latest to anon;
