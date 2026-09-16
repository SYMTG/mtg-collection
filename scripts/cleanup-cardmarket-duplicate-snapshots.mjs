// Collapses runs of consecutive months with identical CM Qty + CM Min down
// to just the first month of the run — those repeats come from the
// Sealed2.csv historical import carrying a value forward across months that
// were never actually re-checked, not from real price stability.
//
// Never touches a row with a product_url (a real userscript-collected
// snapshot) — only pure-historical (product_url IS NULL) rows are removed,
// and only when they exactly repeat the value immediately before them.
//
// Run: node --env-file=.env.local scripts/cleanup-cardmarket-duplicate-snapshots.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

function eq(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.001;
}

async function fetchAllSnapshots() {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("cardmarket_price_snapshots")
      .select("id,product_id,product_name,available_items,price_from,product_url,snapshot_month")
      .order("product_id", { ascending: true })
      .order("snapshot_month", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function run({ dryRun }) {
  const rows = await fetchAllSnapshots();

  const toDelete = [];
  let prev = null;
  for (const row of rows) {
    if (prev && prev.product_id === row.product_id) {
      const sameValues = eq(prev.available_items, row.available_items) && eq(prev.price_from, row.price_from);
      if (sameValues && row.product_url == null) {
        toDelete.push(row);
        continue; // keep comparing later rows to the last KEPT row
      }
    }
    prev = row;
  }

  const byProduct = new Map();
  for (const r of toDelete) byProduct.set(r.product_name, (byProduct.get(r.product_name) ?? 0) + 1);

  console.log(`${toDelete.length} duplicate rows out of ${rows.length} total.`);
  for (const [name, count] of byProduct) console.log(`  ${name} — ${count} month(s)`);

  if (dryRun) {
    console.log("Dry run — nothing deleted.");
    return;
  }

  const ids = toDelete.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error: delError } = await supabase
      .from("cardmarket_price_snapshots")
      .delete()
      .in("id", ids.slice(i, i + 200));
    if (delError) throw delError;
  }
  console.log(`Deleted ${ids.length} rows.`);
}

run({ dryRun: process.argv.includes("--dry-run") });
