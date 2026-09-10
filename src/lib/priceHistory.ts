// price_history now keeps manual (Excel) and Scryfall-synced prices as separate rows
// for the same (card_id, finish, year) — see 01_Projects/MTG/Infrastructure.md.
// Anywhere a single "current" price is needed (totals, Value/Cost columns), Scryfall
// wins when both exist; the manual value is never silently discarded, just not shown
// as the headline number there.

export type PriceRow = {
  card_id: string;
  finish: string;
  year: number;
  price_usd: number;
  source: string;
};

// Key includes year so callers that fetch multiple years can look up any of them.
export function priceKey(cardId: string, finish: string, year: number): string {
  return `${cardId}|${finish}|${year}`;
}

export function effectivePriceMap(rows: PriceRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.source === "scryfall") continue;
    map.set(priceKey(r.card_id, r.finish, r.year), r.price_usd);
  }
  for (const r of rows) {
    if (r.source !== "scryfall") continue;
    map.set(priceKey(r.card_id, r.finish, r.year), r.price_usd);
  }
  return map;
}
