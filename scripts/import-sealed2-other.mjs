// One-off import of "Sealed2 - Other.csv" -> yearly CM Min history for the
// 4 non-Booster-Box sealed items already in sealed_items (Tournament Pack,
// Commander Deck, Duel Deck, Prerelease Kit). This file has no CM Qty and
// no monthly granularity — just one price per year — so each year lands as
// a snapshot dated January 1 of that year. A 0 means "not tracked yet"
// (same convention as scripts/import-sealed.mjs's parsePrice), not a real
// price of zero, and is skipped. Does not touch sealed_items — these
// products' ownership rows already exist and are unaffected.
//
// Run: node --env-file=.env.local scripts/import-sealed2-other.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const CSV_PATH = "D:/Obsidian Vault/SYS Brain/00_Inbox/Sealed2 - Other.csv";
const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// Matches the ROW_OVERRIDES already established in scripts/import-sealed.mjs
// for these exact 4 products.
const ROW_MAP = {
  "urza's saga tournament pack": { code: "usg", productType: "Tournament Pack" },
  "commander 2015 plunder the graves": { code: "c15", productType: "Commander Deck" },
  "duel decks: elspeth vs. kiora: full set": { code: "ddo", productType: "Duel Deck" },
  "fate reforged: battle with savagery prerelease pack": { code: "frf", productType: "Prerelease Kit" },
};

function parsePrice(raw) {
  if (raw === "" || raw === undefined) return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function parseRows() {
  const lines = readFileSync(CSV_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const name = cols[0];
    if (!name || name === "Total") continue;

    const mapping = ROW_MAP[name.toLowerCase().trim()];
    if (!mapping) {
      console.log(`Unresolved: "${name}"`);
      continue;
    }

    const snapshots = [];
    YEARS.forEach((year, i2) => {
      const price = parsePrice(cols[3 + i2]);
      if (price === null) return;
      snapshots.push({
        snapshot_month: `${year}-01-01`,
        collected_at: `${year}-01-01T12:00:00Z`,
        price_from: price,
      });
    });

    rows.push({ name, set_code: mapping.code, product_type: mapping.productType, language: cols[1], snapshots });
  }
  return rows;
}

async function run({ dryRun }) {
  const rows = parseRows();
  console.log(`Parsed ${rows.length} products.`);
  for (const r of rows) {
    console.log(`  ${r.set_code.toUpperCase()} / ${r.product_type} / ${r.language} — ${r.snapshots.length} yearly prices`);
  }
  if (dryRun) {
    console.log("Dry run — nothing written.");
    return;
  }

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

    if (r.snapshots.length) {
      const snapshotRows = r.snapshots.map((s) => ({
        product_id: product.id,
        product_name: r.name,
        product_url: null,
        available_items: null,
        price_from: s.price_from,
        collected_at: s.collected_at,
        snapshot_month: s.snapshot_month,
      }));
      const { error: snapError } = await supabase
        .from("cardmarket_price_snapshots")
        .upsert(snapshotRows, { onConflict: "product_id,snapshot_month", ignoreDuplicates: true });
      if (snapError) throw snapError;
    }

    console.log(`OK  ${r.set_code.toUpperCase()} / ${r.product_type} — ${r.snapshots.length} yearly snapshots`);
  }
  console.log("Done.");
}

run({ dryRun: process.argv.includes("--dry-run") });
