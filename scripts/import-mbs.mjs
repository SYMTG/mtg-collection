// Импорт вкладки MBS из Excel, с разбором по трём реальным сетам:
//   - mbs  (Mirrodin Besieged / MBS FOILS секции)
//   - tmbs (токены + Poison Counter из первой таблицы)
//   - pmbs (Prerelease promos из первой таблицы, номер + "★")
// Qty -> collection_items, история цен -> price_history. Идемпотентно (можно перезапускать).
import { createClient } from "@supabase/supabase-js";
import { extractWorkbook } from "./xlsx-lib.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const EXCEL_PATH = "D:\\Projects\\mtg-collection\\Revision 2026.xlsx";
const REUSE_DIR = "C:\\Users\\Admin\\AppData\\Local\\Temp\\claude\\xlsx_extract";

// Явное сопоставление токенов/счётчиков: имя в Excel -> collector_number в tmbs
const TOKEN_NUMBER_OVERRIDE = {
  "Poison Counter": "6",
};

function findYearColumns(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const m = String(cell).match(/^20(1[5-9]|2[0-6])$/);
    if (m) map[cell] = idx;
  });
  return map;
}

function parsePrice(raw) {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function loadCardMap(setCode) {
  const { data, error } = await supabase.from("cards").select("id,collector_number").eq("set_code", setCode);
  if (error) throw error;
  const map = new Map(data.map((c) => [String(c.collector_number).trim(), c.id]));
  return { ids: data.map((c) => c.id), map };
}

async function loadExistingKeys(cardIds) {
  if (cardIds.length === 0) return new Set();
  const { data } = await supabase.from("collection_items").select("card_id,finish").in("card_id", cardIds);
  return new Set((data ?? []).map((i) => `${i.card_id}|${i.finish}`));
}

async function run() {
  const wb = extractWorkbook(EXCEL_PATH, REUSE_DIR);
  const rows = wb.getSheetRows("MBS");

  const mbsMap = await loadCardMap("mbs");
  const tmbsMap = await loadCardMap("tmbs");
  const pmbsMap = await loadCardMap("pmbs");

  const allIds = [...mbsMap.ids, ...tmbsMap.ids, ...pmbsMap.ids];
  const existingKey = await loadExistingKeys(allIds);

  const priceRows = [];
  const collectionRows = [];
  const notFound = [];
  const skippedExisting = [];

  function resolveCard(setCode, rawNumber) {
    const map = setCode === "mbs" ? mbsMap.map : setCode === "tmbs" ? tmbsMap.map : pmbsMap.map;
    const num = String(rawNumber ?? "").trim();
    if (map.has(num)) return map.get(num);
    if (map.has(num + "★")) return map.get(num + "★");
    return null;
  }

  function addRow({ setCode, name, rawNumber, qty, finish, priceByYear }) {
    const cardId = resolveCard(setCode, rawNumber);
    if (!cardId) {
      notFound.push({ setCode, name, number: rawNumber });
      return;
    }
    for (const [year, price] of priceByYear) {
      priceRows.push({ card_id: cardId, finish, year, price_usd: price });
    }
    if (qty > 0) {
      const key = `${cardId}|${finish}`;
      if (existingKey.has(key)) {
        skippedExisting.push({ setCode, name });
        return;
      }
      collectionRows.push({ card_id: cardId, finish, condition: "NM", quantity: qty });
      existingKey.add(key); // защита от дублей внутри одного прогона
    }
  }

  // --- Раздел 1: "Mirrodin Besieged Tokens" (токены + prerelease promos) ---
  {
    const headerIdx = rows.findIndex((r) => r[0] === "Mirrodin Besieged Tokens");
    const yearCols = findYearColumns(rows[headerIdx]);
    let inPromos = false;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || row[0] === "TOTAL") break;
      if (row[0] === "Prerelease promos") {
        inPromos = true;
        continue;
      }
      if (row[0].startsWith("Rules Tip")) continue; // нет соответствия в каталоге

      const name = row[0];
      const rawNumber = inPromos ? row[1] : TOKEN_NUMBER_OVERRIDE[name] ?? row[1];
      const qty = parseInt(row[2], 10) || 0;
      const priceByYear = [];
      for (const [year, colIdx] of Object.entries(yearCols)) {
        const price = parsePrice(row[colIdx]);
        if (price !== null) priceByYear.push([parseInt(year, 10), price]);
      }

      addRow({
        setCode: inPromos ? "pmbs" : "tmbs",
        name,
        rawNumber,
        qty,
        finish: inPromos ? "foil" : "nonfoil",
        priceByYear,
      });
    }
  }

  // --- Раздел 2 и 3: основной сет (nonfoil) и фойлы ---
  for (const section of [
    { headerLabel: "Mirrodin Besieged", finish: "nonfoil" },
    { headerLabel: "MBS FOILS", finish: "foil" },
  ]) {
    const headerIdx = rows.findIndex((r) => r[0] === section.headerLabel);
    const yearCols = findYearColumns(rows[headerIdx]);

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || row[0] === "TOTAL") break;

      const qty = parseInt(row[2], 10) || 0;
      const priceByYear = [];
      for (const [year, colIdx] of Object.entries(yearCols)) {
        const price = parsePrice(row[colIdx]);
        if (price !== null) priceByYear.push([parseInt(year, 10), price]);
      }

      addRow({
        setCode: "mbs",
        name: row[0],
        rawNumber: row[1],
        qty,
        finish: section.finish,
        priceByYear,
      });
    }
  }

  console.log(`Строк цен для записи: ${priceRows.length}`);
  console.log(`Строк коллекции для записи: ${collectionRows.length}`);
  console.log(`Не найдено в cards (пропущено): ${notFound.length}`);
  if (notFound.length) console.log(notFound);
  console.log(`Пропущено (уже есть в коллекции): ${skippedExisting.length}`);
  if (skippedExisting.length) console.log(skippedExisting);

  for (let i = 0; i < priceRows.length; i += 500) {
    const batch = priceRows.slice(i, i + 500);
    const { error } = await supabase.from("price_history").upsert(batch, { onConflict: "card_id,finish,year" });
    if (error) throw error;
  }

  if (collectionRows.length) {
    const { error } = await supabase.from("collection_items").insert(collectionRows);
    if (error) throw error;
  }

  console.log("Готово.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
