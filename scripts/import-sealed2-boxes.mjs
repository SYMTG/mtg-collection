// One-off import of SYS Brain/00_Inbox/Sealed2.csv — a manually-kept Booster
// Box tracking sheet (ownership + monthly Cardmarket history), superseding
// the Booster Box rows currently in sealed_items (imported long ago from
// sealed.ods and now stale). Booster Pack / other product types are a
// separate, unrelated tracking category and are left untouched.
//
// Layout: columns 1-6 are Year, ReleaseMonth, Name, Lan, Total (owned qty),
// Location (-> note). From column 7 on, 47 repeating pairs of columns, one
// pair per calendar month from Nov 2022 to Sep 2026: first column of the
// pair = CM Qty (available items), second = CM Min (price EUR) for that
// month — confirmed against the live page and the userscript's own data.
//
// Run: node --env-file=.env.local scripts/import-sealed2-boxes.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import sets from "../src/data/sets.json" with { type: "json" };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const CSV_PATH = "D:/Obsidian Vault/SYS Brain/00_Inbox/Sealed2.csv";

// Known gaps in sets.json (see MTG/Infrastructure.md "Известные пробелы").
const NAME_TO_CODE = {
  dominaria: "dom",
  "spider man": "spm",
};

const byName = new Map();
for (const s of sets) byName.set(s.n.toLowerCase().trim(), s.c.toLowerCase());

function resolveCode(name) {
  const key = name.toLowerCase().trim();
  return NAME_TO_CODE[key] ?? byName.get(key) ?? null;
}

// 47 columns pairs, Nov 2022 .. Sep 2026, in header order.
const MONTHS = [];
for (let y = 2022, m = 11; y < 2026 || (y === 2026 && m <= 9); m++) {
  if (m > 12) {
    m = 1;
    y++;
  }
  MONTHS.push({ year: y, month: m });
}

function parseRows() {
  const lines = readFileSync(CSV_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const rows = [];
  const unresolved = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const total = parseInt(cols[4], 10) || 0;
    if (total <= 0) continue;

    const name = cols[2];
    const language = cols[3];
    const location = cols[5] || null;
    const code = resolveCode(name);
    if (!code) {
      unresolved.push(name);
      continue;
    }

    const snapshots = [];
    for (let m = 0; m < MONTHS.length; m++) {
      const qtyRaw = cols[6 + m * 2];
      const minRaw = cols[6 + m * 2 + 1];
      const qty = qtyRaw ? parseInt(qtyRaw, 10) : null;
      const min = minRaw ? parseFloat(minRaw) : null;
      if (qty == null && min == null) continue;
      const { year, month } = MONTHS[m];
      const mm = String(month).padStart(2, "0");
      snapshots.push({
        snapshot_month: `${year}-${mm}-01`,
        collected_at: `${year}-${mm}-01T12:00:00Z`,
        available_items: qty,
        price_from: min,
      });
    }

    rows.push({ name, set_code: code, language, quantity: total, note: location, snapshots });
  }

  return { rows, unresolved };
}

async function run({ dryRun }) {
  const { rows, unresolved } = parseRows();
  console.log(`Parsed ${rows.length} owned Booster Box rows, ${unresolved.length} unresolved names.`);
  if (unresolved.length) console.log("Unresolved:", unresolved);
  if (dryRun) {
    for (const r of rows) {
      console.log(`  ${r.set_code.toUpperCase()} / ${r.language} qty=${r.quantity} note=${r.note ?? "-"} snapshots=${r.snapshots.length}`);
    }
    console.log("Dry run — nothing written.");
    return;
  }

  // 1. Clear only the stale Booster Box rows in sealed_items.
  const { data: boxProducts, error: boxErr } = await supabase
    .from("sealed_products")
    .select("id")
    .eq("product_type", "Booster Box");
  if (boxErr) throw boxErr;
  const boxIds = (boxProducts ?? []).map((p) => p.id);
  if (boxIds.length) {
    const { error } = await supabase.from("sealed_items").delete().in("product_id", boxIds);
    if (error) throw error;
    console.log(`Deleted ${boxIds.length} existing Booster Box sealed_items.`);
  }

  // 2. Re-create products/items, backfill snapshots without overwriting
  //    anything the userscript already collected live (ignoreDuplicates).
  for (const r of rows) {
    const { data: product, error: upsertError } = await supabase
      .from("sealed_products")
      .upsert(
        { set_code: r.set_code, product_type: "Booster Box", language: r.language },
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
      const snapshotRows = r.snapshots.map((s) => ({
        product_id: product.id,
        product_name: `${r.name} Booster Box`,
        product_url: null,
        available_items: s.available_items,
        price_from: s.price_from,
        collected_at: s.collected_at,
        snapshot_month: s.snapshot_month,
      }));
      const { error: snapError } = await supabase
        .from("cardmarket_price_snapshots")
        .upsert(snapshotRows, { onConflict: "product_id,snapshot_month", ignoreDuplicates: true });
      if (snapError) throw snapError;
    }

    console.log(`OK  ${r.set_code.toUpperCase()} / ${r.language} — qty ${r.quantity}, ${r.snapshots.length} monthly snapshots`);
  }

  console.log("Done.");
}

run({ dryRun: process.argv.includes("--dry-run") });
