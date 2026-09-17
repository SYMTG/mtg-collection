// One-off import of SYS Brain/00_Inbox/Sealed2 - Packs.csv — a manually-kept
// Booster Pack tracking sheet (ownership + yearly-January Cardmarket
// history), superseding whatever Booster Pack rows already exist in
// sealed_items (imported earlier from an older spreadsheet). Two rows in
// this sheet aren't actually Booster Pack products — "Ixalan Buy-a-Box"
// and "Ixalan Treasure Chest" — and get their own correct product_type.
//
// Layout: Name, Year (set's release year, informational only), Language,
// Qty (owned quantity), then 12 columns 2015..2026 — CM Min price
// snapshotted each January, 0 meaning "not tracked yet" (same convention
// as scripts/import-sealed2-other.mjs), then a Comment column. Two
// trailing unnamed columns are spreadsheet leftovers with no meaning and
// are ignored.
//
// Run: node --env-file=.env.local scripts/import-sealed2-packs.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import sets from "../src/data/sets.json" with { type: "json" };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const CSV_PATH = "D:/Obsidian Vault/SYS Brain/00_Inbox/Sealed2 - Packs.csv";

// Set names in this sheet that don't match sets.json's official Scryfall
// name verbatim — either a typo in the sheet (Amoklhet, Hour of
// Devostation, Modern Horizon 3, Outlawas of Thunder Junction, Foundation)
// or a shortened/older name the sheet uses instead of the full official one
// (Revised, Oath Of Gatewatch, Shadow Over Innistrad, M19, Core 2020,
// Strixhaven — confirmed against the sheet's own 2021 release year, not the
// 2026 "Secrets of Strixhaven" remaster of the same word).
const NAME_TO_CODE = {
  revised: "3ed",
  "oath of gatewatch": "ogw",
  "shadow over innistrad": "soi",
  amoklhet: "akh",
  "hour of devostation": "hou",
  m19: "m19",
  "core 2020": "m20",
  strixhaven: "stx",
  foundation: "fdn",
  "modern horizon 3": "mh3",
  "outlawas of thunder junction": "otj",
};

// Named like a normal set row but actually a different product entirely —
// both are Ixalan, but "resolveCode" wouldn't find either name in sets.json.
const PRODUCT_TYPE_OVERRIDES = {
  "ixalan buy-a-box": "Buy-a-Box Promo",
  "ixalan treasure chest": "Treasure Chest",
};
NAME_TO_CODE["ixalan buy-a-box"] = "xln";
NAME_TO_CODE["ixalan treasure chest"] = "xln";

// The sheet uses "FR" for French on its newest rows and "FRA" (the app's
// actual LANGUAGES value) on its older ones — normalize to one language
// code per Cardmarket product family instead of splitting it into two.
const LANGUAGE_ALIASES = { FR: "FRA" };

const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const byName = new Map();
for (const s of sets) byName.set(s.n.toLowerCase().trim(), s.c.toLowerCase());

function resolveCode(name) {
  const key = name.toLowerCase().trim();
  return NAME_TO_CODE[key] ?? byName.get(key) ?? null;
}

function parsePrice(raw) {
  if (raw === "" || raw === undefined) return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function parseRows() {
  const lines = readFileSync(CSV_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const rows = [];
  const unresolved = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const name = cols[0];
    if (!name || name === "Total") continue;

    const language = LANGUAGE_ALIASES[cols[2]] ?? cols[2];
    const quantity = parseInt(cols[3], 10) || 0;
    if (quantity <= 0) continue;

    const code = resolveCode(name);
    if (!code) {
      unresolved.push(name);
      continue;
    }

    const key = name.toLowerCase().trim();
    const productType = PRODUCT_TYPE_OVERRIDES[key] ?? "Booster Pack";
    const note = cols[16] || null;

    const snapshots = [];
    YEARS.forEach((year, idx) => {
      const price = parsePrice(cols[4 + idx]);
      if (price === null) return;
      snapshots.push({
        snapshot_month: `${year}-01-01`,
        collected_at: `${year}-01-01T12:00:00Z`,
        price_from: price,
      });
    });

    rows.push({ name, set_code: code, product_type: productType, language, quantity, note, snapshots });
  }

  return { rows, unresolved };
}

async function run({ dryRun }) {
  const { rows, unresolved } = parseRows();
  console.log(`Parsed ${rows.length} owned rows, ${unresolved.length} unresolved names.`);
  if (unresolved.length) console.log("Unresolved:", unresolved);
  if (dryRun) {
    for (const r of rows) {
      console.log(
        `  ${r.set_code.toUpperCase()} / ${r.product_type} / ${r.language} qty=${r.quantity} note=${r.note ?? "-"} snapshots=${r.snapshots.length}`
      );
    }
    console.log("Dry run — nothing written.");
    return;
  }

  // 1. Clear only the stale rows of the product types this sheet covers —
  //    this sheet supersedes the older spreadsheet's numbers for these
  //    types, it doesn't layer on top of them.
  const { data: staleProducts, error: staleErr } = await supabase
    .from("sealed_products")
    .select("id")
    .in("product_type", ["Booster Pack", "Buy-a-Box Promo", "Treasure Chest"]);
  if (staleErr) throw staleErr;
  const staleIds = (staleProducts ?? []).map((p) => p.id);
  if (staleIds.length) {
    const { error } = await supabase.from("sealed_items").delete().in("product_id", staleIds);
    if (error) throw error;
    console.log(`Deleted ${staleIds.length} existing sealed_items for Booster Pack/Buy-a-Box Promo/Treasure Chest.`);
  }

  // 2. Re-create products/items, and overwrite each January snapshot with
  //    this sheet's figure (upsert, not ignoreDuplicates) — it can only
  //    collide with a January slot from the older import it's replacing,
  //    never with a live current-month snapshot from the userscript.
  for (const r of rows) {
    const { data: product, error: upsertError } = await supabase
      .from("sealed_products")
      .upsert(
        { set_code: r.set_code, product_type: r.product_type, language: r.language },
        { onConflict: "set_code,product_type,language" }
      )
      .select("id")
      .single();
    if (upsertError || !product) throw upsertError ?? new Error("sealed_products upsert failed");

    const { error: itemError } = await supabase
      .from("sealed_items")
      .insert({ product_id: product.id, quantity: r.quantity, note: r.note });
    if (itemError) throw itemError;

    if (r.snapshots.length) {
      const productName = r.product_type === "Booster Pack" ? `${r.name} Booster Pack` : r.name;
      const snapshotRows = r.snapshots.map((s) => ({
        product_id: product.id,
        product_name: productName,
        product_url: null,
        available_items: null,
        price_from: s.price_from,
        collected_at: s.collected_at,
        snapshot_month: s.snapshot_month,
      }));
      const { error: snapError } = await supabase
        .from("cardmarket_price_snapshots")
        .upsert(snapshotRows, { onConflict: "product_id,snapshot_month" });
      if (snapError) throw snapError;
    }

    console.log(
      `OK  ${r.set_code.toUpperCase()} / ${r.product_type} / ${r.language} — qty ${r.quantity}, ${r.snapshots.length} yearly snapshots`
    );
  }

  console.log("Done.");
}

run({ dryRun: process.argv.includes("--dry-run") });
