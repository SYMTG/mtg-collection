// Общая библиотека для лёгкого чтения .xlsx без загрузки всей книги в память.
import { readFileSync, copyFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

function decodeXmlText(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function colToIndex(col) {
  let idx = 0;
  for (const ch of col) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

export function extractWorkbook(filePath, reuseDir) {
  let dir = reuseDir;
  if (!dir) {
    dir = mkdtempSync(path.join(tmpdir(), "xlsx-lib-"));
    const zipCopy = path.join(dir, "book.zip");
    copyFileSync(filePath, zipCopy);
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipCopy}' -DestinationPath '${dir}' -Force"`,
      { stdio: "ignore" }
    );
  }

  const workbookXml = readFileSync(path.join(dir, "xl", "workbook.xml"), "utf-8");
  const sheetEntries = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"[^>]*\/>/g)].map(
    (m) => ({ name: decodeXmlText(m[1]), rId: m[2] })
  );

  const relsXml = readFileSync(path.join(dir, "xl", "_rels", "workbook.xml.rels"), "utf-8");
  const relMap = {};
  for (const m of relsXml.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
    relMap[m[1]] = m[2];
  }

  let sharedStrings = [];
  const ssPath = path.join(dir, "xl", "sharedStrings.xml");
  if (existsSync(ssPath)) {
    const ssXml = readFileSync(ssPath, "utf-8");
    const siBlocks = ssXml.match(/<si>[\s\S]*?<\/si>/g) ?? [];
    sharedStrings = siBlocks.map((block) => {
      const texts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
      return decodeXmlText(texts.join(""));
    });
  }

  const sheetNames = sheetEntries.map((s) => s.name);

  function getSheetRows(sheetName) {
    const entry = sheetEntries.find((s) => s.name === sheetName);
    if (!entry) throw new Error(`Sheet not found: ${sheetName}`);
    const target = relMap[entry.rId];
    const sheetXml = readFileSync(path.join(dir, "xl", target), "utf-8");

    const rowBlocks = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? [];
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
          value = t ? decodeXmlText(t[1]) : "";
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

    // Trim fully-empty trailing rows/cols (common Excel formatting bloat)
    while (grid.length && (!grid[grid.length - 1] || grid[grid.length - 1].every((c) => !c))) {
      grid.pop();
    }
    return grid.map((row) => {
      if (!row) return [];
      const r = [...row];
      while (r.length && !r[r.length - 1]) r.pop();
      return r.map((c) => c ?? "");
    });
  }

  return { dir, sheetNames, getSheetRows };
}

export function cleanupWorkbook(dir) {
  rmSync(dir, { recursive: true, force: true });
}
