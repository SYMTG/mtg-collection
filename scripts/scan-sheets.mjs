import { extractWorkbook } from "./xlsx-lib.mjs";

const filePath = process.argv[2];
const REUSE_DIR = process.argv[3]; // опционально: переиспользовать уже распакованную папку

const META_SHEETS = new Set(["Total", "Sealed", "Promos", "Expeditions", "Reserved List"]);

const wb = extractWorkbook(filePath, REUSE_DIR);

function looksLikeHeader(row) {
  // Заголовок таблицы: где-то есть "#" и "Qty" рядом, или подряд идут года 2015..2026
  const joined = row.map(String);
  const hasHashQty = joined.some((c) => c === "#") && joined.some((c) => c === "Qty");
  const yearCount = joined.filter((c) => /^20(1[5-9]|2[0-6])$/.test(c)).length;
  return hasHashQty || yearCount >= 4;
}

for (const sheetName of wb.sheetNames) {
  if (META_SHEETS.has(sheetName)) continue;
  let rows;
  try {
    rows = wb.getSheetRows(sheetName);
  } catch (e) {
    console.log(`${sheetName}: ERROR ${e.message}`);
    continue;
  }

  const headers = [];
  rows.forEach((row, i) => {
    if (looksLikeHeader(row)) {
      headers.push({ line: i + 1, label: row[0], cols: row.length });
    }
  });

  const label = headers.map((h) => `[L${h.line} "${h.label}" (${h.cols}c)]`).join(" ");
  console.log(`${sheetName} (${rows.length} rows): ${label}`);
}
