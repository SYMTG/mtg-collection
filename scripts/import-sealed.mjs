// Импорт SYS Brain/01_Projects/MTG/Library/sealed.ods -> sealed_products / sealed_items / sealed_price_history.
// Три раздела на одном листе: Boxes, Boosters, Other. Идемпотентно (upsert на sealed_products/price_history,
// но sealed_items — insert, поэтому повторный запуск задублирует количество; скрипт для одноразового прогона).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import sets from "../src/data/sets.json" with { type: "json" };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const ODS_PATH = "D:/Obsidian Vault/SYS Brain/01_Projects/MTG/Library/sealed.ods";
const YEAR_COLS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

// Опечатки/расхождения в названиях против sets.json, плюс сеты, которых нет в каталоге (Dominaria 2018).
const NAME_TO_CODE = {
  "jorney into nyx": "JOU",
  "hour of devostation": "HOU",
  "dominaria": "DOM",
  "magic 2021": "M21",
  "strixhaven": "STX",
  "revised": "3ED",
  "ugin's fate": "UGIN",
  "oath of gatewatch": "OGW",
  "shadow over innistrad": "SOI",
  "amoklhet": "AKH",
  "m19": "M19",
  "core 2020": "M20",
};

// Раздел "Other" плюс два товара из "Boosters", которые на деле не бустеры — задаём явный product_type/note.
const ROW_OVERRIDES = {
  "ixalan buy-a-box": { code: "XLN", productType: "Buy-a-Box Promo" },
  "ixalan treasure chest": { code: "XLN", productType: "Treasure Chest" },
  "urza's saga tournament pack": { code: "USG", productType: "Tournament Pack" },
  "commander 2015 plunder the graves": { code: "C15", productType: "Commander Deck", note: "Plunder the Graves" },
  "duel decks: elspeth vs. kiora: full set": { code: "DDO", productType: "Duel Deck" },
  "fate reforged: battle with savagery prerelease pack": {
    code: "FRF",
    productType: "Prerelease Kit",
    note: "Battle with Savagery",
  },
};

const byName = new Map();
for (const s of sets) byName.set(s.n.toLowerCase().trim(), s.c);

function resolveCode(name) {
  const key = name.toLowerCase().trim();
  if (ROW_OVERRIDES[key]) return ROW_OVERRIDES[key].code;
  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key];
  return byName.get(key) ?? null;
}

function parsePrice(raw) {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function run() {
  const wb = XLSX.read(readFileSync(ODS_PATH), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Лист1"], { header: 1, raw: false });

  const SECTION_TYPE = { Boxes: "Booster Box", Boosters: "Booster Pack" };
  let section = null;

  const products = []; // { key, set_code, product_type, language, note?, priceByYear: Map, quantity }
  const productByKey = new Map();
  const unresolved = [];

  for (const row of rows) {
    const name = row[0];
    if (!name) continue;
    if (name === "Boxes" || name === "Boosters" || name === "Other") {
      section = name;
      continue;
    }
    if (name === "Name" || name === "Total") continue;

    const key = name.toLowerCase().trim();
    const code = resolveCode(name);
    if (!code) {
      unresolved.push(name);
      continue;
    }

    const override = ROW_OVERRIDES[key];
    const productType = override?.productType ?? SECTION_TYPE[section] ?? "Other";
    const note = override?.note ?? null;
    const language = (row[2] ?? "ENG").trim();
    const quantity = parseInt(row[3], 10) || 0;

    const priceByYear = new Map();
    YEAR_COLS.forEach((year, i) => {
      const price = parsePrice(row[4 + i]);
      if (price !== null) priceByYear.set(year, price);
    });

    const productKey = `${code.toLowerCase()}|${productType}|${language}`;
    let product = productByKey.get(productKey);
    if (!product) {
      product = { set_code: code.toLowerCase(), product_type: productType, language, priceByYear: new Map() };
      productByKey.set(productKey, product);
      products.push(product);
    }
    for (const [year, price] of priceByYear) product.priceByYear.set(year, price);

    product.items = product.items ?? [];
    if (quantity > 0) product.items.push({ quantity, note });
  }

  console.log(`Товаров (уникальные сет+тип+язык): ${products.length}`);
  console.log(`Не распознано названий: ${unresolved.length}`);
  if (unresolved.length) console.log(unresolved);

  return products;
}

async function upsertAll(products) {
  for (const p of products) {
    const { data: product, error: upsertError } = await supabase
      .from("sealed_products")
      .upsert(
        { set_code: p.set_code, product_type: p.product_type, language: p.language },
        { onConflict: "set_code,product_type,language" }
      )
      .select("id")
      .single();
    if (upsertError) throw upsertError;

    const priceRows = [...p.priceByYear.entries()].map(([year, price_usd]) => ({
      product_id: product.id,
      year,
      price_usd,
    }));
    if (priceRows.length) {
      const { error } = await supabase
        .from("sealed_price_history")
        .upsert(priceRows, { onConflict: "product_id,year" });
      if (error) throw error;
    }

    for (const item of p.items ?? []) {
      const { error } = await supabase
        .from("sealed_items")
        .insert({ product_id: product.id, quantity: item.quantity, note: item.note });
      if (error) throw error;
    }

    console.log(`OK  ${p.set_code.toUpperCase()} / ${p.product_type} / ${p.language} — ${p.priceByYear.size} price rows, ${p.items?.length ?? 0} item rows`);
  }
}

const products = run();
if (process.argv.includes("--dry-run")) {
  console.log("Dry run — ничего не записано.");
} else {
  await upsertAll(products);
  console.log("Готово.");
}
