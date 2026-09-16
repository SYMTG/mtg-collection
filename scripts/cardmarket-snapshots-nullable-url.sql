-- Historical snapshots backfilled from a spreadsheet (no source page visited,
-- so no URL to record) need product_url to be optional.
alter table cardmarket_price_snapshots alter column product_url drop not null;
