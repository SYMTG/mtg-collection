-- sealed_price_history is dead: no page reads it anymore since the sealed
-- page moved to cardmarket_price_snapshots. Leftover from the very first
-- sealed.ods import (scripts/import-sealed.mjs), 801 rows, superseded.

drop table sealed_price_history;
