// Лёгкий парсер одного листа .xlsx без загрузки всей книги в память
// (обходит проблему с OOM у пакета xlsx на больших многолистовых файлах).
// Использование: node scripts/read-excel-lite.mjs "<path.xlsx>" "<SheetName>"

import { readFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const filePath = process.argv[2];
const sheetName = process.argv[3];

if (!filePath || !sheetName) {
  console.error("Использование: node read-excel-lite.mjs <file.xlsx> <SheetName>");
  process.exit(1);
}

const tmp = mkdtempSync(path.join(tmpdir(), "xlsx-lite-"));

try {
  const zipCopy = path.join(tmp, "book.zip");
  copyFileSync(filePath, zipCopy);
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipCopy}' -DestinationPath '${tmp}' -Force"`,
    { stdio: "ignore" }
  );

  const workbookXml = readFileSync(path.join(tmp, "xl", "workbook.xml"), "utf-8");
  const sheetMatch = workbookXml.match(
    new RegExp(`<sheet[^>]*name="${sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*r:id="(rId\\d+)"`)
  );
  if (!sheetMatch) {
    console.error(`Вкладка "${sheetName}" не найдена в workbook.xml`);
    process.exit(1);
  }
  const rId = sheetMatch[1];

  const relsXml = readFileSync(path.join(tmp, "xl", "_rels", "workbook.xml.rels"), "utf-8");
  const relMatch = relsXml.match(new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`));
  if (!relMatch) {
    console.error(`Не найден target для ${rId}`);
    process.exit(1);
  }
  const sheetFile = path.join(tmp, "xl", relMatch[1]);

  let sharedStrings = [];
  try {
    const ssXml = readFileSync(path.join(tmp, "xl", "sharedStrings.xml"), "utf-8");
    const siBlocks = ssXml.match(/<si>[\s\S]*?<\/si>/g) ?? [];
    sharedStrings = siBlocks.map((block) => {
      const texts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
      return texts
        .join("")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    });
  } catch {
    // no sharedStrings.xml — тоже нормально
  }

  const sheetXml = readFileSync(sheetFile, "utf-8");
  const rowBlocks = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? [];

  function colToIndex(col) {
    let idx = 0;
    for (const ch of col) idx = idx * 26 + (ch.charCodeAt(0) - 64);
    return idx - 1;
  }

  const grid = [];
  for (const rowBlock of rowBlocks) {
    const rowAttr = rowBlock.match(/<row[^>]*r="(\d+)"/);
    const rowNum = rowAttr ? parseInt(rowAttr[1], 10) - 1 : grid.length;

    const cells = [...rowBlock.matchAll(/<c\s+r="([A-Z]+)\d+"(?:\s+[^>]*)?(?:\/>|>([\s\S]*?)<\/c>)/g)];
    const rowArr = [];
    for (const cellMatch of cells) {
      const colLetters = cellMatch[1];
      const cellInner = cellMatch[0];
      const colIdx = colToIndex(colLetters);

      const typeMatch = cellInner.match(/t="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : "n";

      let value = "";
      if (type === "inlineStr") {
        const t = cellInner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        value = t ? t[1] : "";
      } else {
        const v = cellInner.match(/<v>([\s\S]*?)<\/v>/);
        const raw = v ? v[1] : "";
        if (type === "s") {
          value = sharedStrings[parseInt(raw, 10)] ?? "";
        } else {
          value = raw;
        }
      }
      rowArr[colIdx] = value;
    }
    grid[rowNum] = rowArr;
  }

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    console.log(JSON.stringify(row.map((c) => c ?? "")));
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
