// Импорт "Истории накоплений" из SYS Brain/01_Projects/CZN/Account/Economic.md -> czn_economy_snapshots.
// Комбатанты/селекторы/эго-камни исторически не велись по датам — берём их только
// из frontmatter и прикрепляем к самой свежей (последней) строке истории.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const ECONOMIC_PATH = "D:/Obsidian Vault/SYS Brain/01_Projects/CZN/Account/Economic.md";

const HISTORY_RE =
  /^-\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d+)\s*Crystall,\s*(\d+)\s*LB pulls,\s*(\d+)\s*SB pulls,\s*LB Pity\s*(\d+)\s*\((Yes|No)\),\s*SB Pity\s*(\d+)/;

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  const fm = {};
  let dashCount = 0;
  for (const line of lines) {
    if (line.trim() === "---") {
      dashCount++;
      if (dashCount === 2) break;
      continue;
    }
    if (dashCount === 1) {
      const m = line.match(/^([^:]+):\s?(.*)$/);
      if (m) fm[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
    }
  }
  return fm;
}

function run() {
  const text = readFileSync(ECONOMIC_PATH, "utf8");
  const fm = parseFrontmatter(text);

  const snapshots = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(HISTORY_RE);
    if (!m) continue;
    snapshots.push({
      snapshot_date: m[1],
      crystals: parseInt(m[2], 10),
      lb_pulls: parseInt(m[3], 10),
      sb_pulls: parseInt(m[4], 10),
      lb_pity: parseInt(m[5], 10),
      lb_guaranteed: m[6] === "Yes",
      sb_pity: parseInt(m[7], 10),
    });
  }
  snapshots.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  const combatants = fm.Combatants?.match(/(\d+)\s*\/\s*(\d+)/);
  const last = snapshots[snapshots.length - 1];
  if (last) {
    last.combatants_owned = combatants ? parseInt(combatants[1], 10) : null;
    last.combatants_total = combatants ? parseInt(combatants[2], 10) : null;
    last.selector = fm.Selector ? parseInt(fm.Selector, 10) : null;
    last.ego_stone = fm["Ego stone"] ? parseInt(fm["Ego stone"], 10) : null;
  }

  return snapshots;
}

async function upsertAll(snapshots) {
  const { error } = await supabase.from("czn_economy_snapshots").upsert(snapshots, { onConflict: "snapshot_date" });
  if (error) throw error;
  for (const s of snapshots) console.log(`OK  ${s.snapshot_date} — ${s.crystals} crystals`);
}

const snapshots = run();
console.log(`Снимков найдено: ${snapshots.length}`);
if (process.argv.includes("--dry-run")) {
  console.log(snapshots);
  console.log("Dry run — ничего не записано.");
} else {
  await upsertAll(snapshots);
  console.log("Готово.");
}
