// Одноразовый скрипт импорта каталога карт Scryfall в таблицу `cards`.
// Запуск: node --env-file=.env.local scripts/import-cards.mjs

import { createClient } from "@supabase/supabase-js";
import zlib from "node:zlib";
import readline from "node:readline";
import { Readable } from "node:stream";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Не найдены SUPABASE_URL / SUPABASE_SECRET_KEY в окружении.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const BATCH_SIZE = 1000;

const SCRYFALL_HEADERS = {
  "User-Agent": "MTGCollectionApp/1.0 (personal project)",
  Accept: "application/json",
};

async function getDefaultCardsUrl() {
  const res = await fetch("https://api.scryfall.com/bulk-data", {
    headers: SCRYFALL_HEADERS,
  });
  const json = await res.json();
  const entry = json.data.find((d) => d.type === "default_cards");
  if (!entry) throw new Error("Не найден default_cards в bulk-data API");
  return entry.jsonl_download_uri;
}

function mapCard(card) {
  if (!card.id || !card.oracle_id || !card.name || !card.set || !card.rarity) {
    return null;
  }
  return {
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    set_code: card.set,
    collector_number: card.collector_number ?? "",
    border_color: card.border_color ?? null,
    full_art: !!card.full_art,
    frame_effects: card.frame_effects ?? [],
    rarity: card.rarity,
    finishes: card.finishes ?? [],
    promo: !!card.promo,
    released_at: card.released_at ?? null,
  };
}

async function run() {
  console.log("Получаю ссылку на актуальный дамп Default Cards...");
  const url = await getDefaultCardsUrl();
  console.log("Скачиваю:", url);

  const res = await fetch(url, { headers: SCRYFALL_HEADERS });
  const gunzip = zlib.createGunzip();
  Readable.fromWeb(res.body).pipe(gunzip);

  const rl = readline.createInterface({ input: gunzip, crlfDelay: Infinity });

  let batch = [];
  let total = 0;
  let imported = 0;
  let skippedLang = 0;
  let skippedDigital = 0;
  let skippedInvalid = 0;

  async function flush() {
    if (batch.length === 0) return;
    const { error } = await supabase.from("cards").upsert(batch, { onConflict: "id" });
    if (error) {
      console.error("Ошибка при вставке пачки:", error.message);
      process.exit(1);
    }
    imported += batch.length;
    batch = [];
    process.stdout.write(`\rОбработано: ${total}, импортировано: ${imported}`);
  }

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "[" || trimmed === "]") continue;
    const jsonStr = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
    if (!jsonStr) continue;

    let card;
    try {
      card = JSON.parse(jsonStr);
    } catch {
      continue;
    }

    total++;

    if (card.lang !== "en") {
      skippedLang++;
      continue;
    }
    if (!card.games || !card.games.includes("paper")) {
      skippedDigital++;
      continue;
    }

    const row = mapCard(card);
    if (!row) {
      skippedInvalid++;
      continue;
    }

    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
  }

  await flush();

  console.log("\n\nГотово.");
  console.log(`Всего строк в дампе: ${total}`);
  console.log(`Импортировано в cards: ${imported}`);
  console.log(`Пропущено (не английский): ${skippedLang}`);
  console.log(`Пропущено (не бумажные): ${skippedDigital}`);
  console.log(`Пропущено (неполные данные): ${skippedInvalid}`);
}

run().catch((err) => {
  console.error("Импорт упал с ошибкой:", err);
  process.exit(1);
});
