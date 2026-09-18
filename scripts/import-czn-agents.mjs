// Импорт SYS Brain/01_Projects/CZN/Agents (+ /Unaquired Agents) -> czn_agents / czn_roster.
// Читает frontmatter заметок напрямую из vault'а. Insert-only по имени агента — ростер
// (tier/level/ego/potential/equipment/save_date/owned) теперь ведётся на сайте, а не в
// vault'е, поэтому скрипт НЕ трогает уже существующих в базе агентов, только заводит
// новых (когда в vault появляется заметка на персонажа, которого ещё нет в czn_agents).
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const CZN_ROOT = "D:/Obsidian Vault/SYS Brain/01_Projects/CZN";
const SOURCES = [
  { dir: join(CZN_ROOT, "Agents"), owned: true },
  { dir: join(CZN_ROOT, "Unaquired Agents"), owned: false },
];

function parseFrontmatter(filePath) {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
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

function toInt(val) {
  if (val === undefined || val === null || val === "") return null;
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : null;
}

function toText(val) {
  return val === undefined || val === null || val === "" ? null : val;
}

function collectAgents() {
  const agents = [];
  for (const source of SOURCES) {
    let files;
    try {
      files = readdirSync(source.dir).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const file of files) {
      const fm = parseFrontmatter(join(source.dir, file));
      if (!fm.name) continue;
      agents.push({
        name: fm.name,
        class: fm.class,
        role: fm.Role,
        attribute: fm.attribute,
        rarity: toInt(fm.rarity),
        owned: source.owned,
        tier: toText(fm.tier),
        level: toInt(fm.level),
        ego: toInt(fm.Ego),
        potential: toText(fm.Potential),
        signature_partner: toText(fm["Signature partner"]),
        equipment: toText(fm.Equipment),
        save_date: toText(fm["Save Date"]),
      });
    }
  }
  return agents;
}

async function insertNew(agents) {
  const { data: existing, error: existingError } = await supabase.from("czn_agents").select("name");
  if (existingError) throw existingError;
  const existingNames = new Set((existing ?? []).map((r) => r.name));

  const newAgents = agents.filter((a) => !existingNames.has(a.name));
  if (newAgents.length === 0) {
    console.log("Новых агентов нет — все уже есть в базе.");
    return;
  }

  for (const a of newAgents) {
    const { data: agent, error: agentError } = await supabase
      .from("czn_agents")
      .insert({ name: a.name, class: a.class, role: a.role, attribute: a.attribute, rarity: a.rarity })
      .select("id")
      .single();
    if (agentError) throw agentError;

    const { error: rosterError } = await supabase.from("czn_roster").insert({
      agent_id: agent.id,
      owned: a.owned,
      tier: a.tier,
      level: a.level,
      ego: a.ego,
      potential: a.potential,
      signature_partner: a.signature_partner,
      equipment: a.equipment,
      save_date: a.save_date,
    });
    if (rosterError) throw rosterError;

    console.log(`NEW  ${a.name} (${a.owned ? "owned" : "not owned"})`);
  }
}

const agents = collectAgents();
console.log(`Агентов в vault: ${agents.length}`);
if (process.argv.includes("--dry-run")) {
  console.log(agents);
  console.log("Dry run — ничего не записано.");
} else {
  await insertNew(agents);
  console.log("Готово.");
}
