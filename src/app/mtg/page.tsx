"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import setsData from "@/data/sets.json";
import { parseSet, type RawSet, type ParsedSet } from "@/lib/setIcon";
import { supabase } from "@/lib/supabaseClient";
import { effectivePriceMap, priceKey } from "@/lib/priceHistory";

type SortKey = "n" | "q" | "d" | "value";

const LATEST_YEAR = 2026;

function HomeInner() {
  const searchParams = useSearchParams();
  const onlyOwned = searchParams.get("collection") === "1";

  const sets = useMemo(() => (setsData as RawSet[]).map(parseSet), []);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [ownedQtyByCode, setOwnedQtyByCode] = useState<Map<string, number> | null>(null);
  const [valueByCode, setValueByCode] = useState<Map<string, number> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  type CollectionRow = { card_id: string; finish: string; quantity: number; cards: { set_code: string } | null };

  const fetchCollectionData = useCallback(async (): Promise<{
    ownedQtyByCode: Map<string, number>;
    valueByCode: Map<string, number>;
  }> => {
    const { data } = await supabase
      .from("collection_items")
      .select("card_id,finish,quantity,cards(set_code)");
    const items = (data ?? []) as unknown as CollectionRow[];

    const qtyMap = new Map<string, number>();
    for (const row of items) {
      const code = row.cards?.set_code;
      if (!code) continue;
      qtyMap.set(code, (qtyMap.get(code) ?? 0) + row.quantity);
    }

    const cardIds = [...new Set(items.map((i) => i.card_id))];
    if (cardIds.length === 0) return { ownedQtyByCode: qtyMap, valueByCode: new Map() };

    const { data: prices } = await supabase
      .from("price_history")
      .select("card_id,finish,year,price_usd,source")
      .in("card_id", cardIds)
      .eq("year", LATEST_YEAR);
    const priceMap = effectivePriceMap(prices ?? []);

    const valMap = new Map<string, number>();
    for (const row of items) {
      const code = row.cards?.set_code;
      if (!code) continue;
      const price = priceMap.get(priceKey(row.card_id, row.finish, LATEST_YEAR)) ?? 0;
      valMap.set(code, (valMap.get(code) ?? 0) + price * row.quantity);
    }
    return { ownedQtyByCode: qtyMap, valueByCode: valMap };
  }, []);

  const applyCollectionData = useCallback((result: Awaited<ReturnType<typeof fetchCollectionData>>) => {
    setOwnedQtyByCode(result.ownedQtyByCode);
    setValueByCode(result.valueByCode);
  }, []);

  useEffect(() => {
    fetchCollectionData().then((result) => applyCollectionData(result));
  }, [fetchCollectionData, applyCollectionData]);

  async function handleSyncPrices() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const { data: items, error: itemsError } = await supabase
        .from("collection_items")
        .select("card_id,finish");
      if (itemsError) throw itemsError;

      const cardIds = [...new Set((items ?? []).map((i) => i.card_id))];
      if (cardIds.length === 0) {
        setSyncMessage("Nothing to sync — collection is empty.");
        return;
      }

      const scryfallPrices = new Map<string, { usd: string | null; usd_foil: string | null; usd_etched: string | null }>();
      for (let i = 0; i < cardIds.length; i += 75) {
        const batch = cardIds.slice(i, i + 75);
        const res = await fetch("https://api.scryfall.com/cards/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
        });
        const json = await res.json();
        for (const card of json.data ?? []) {
          scryfallPrices.set(card.id, card.prices);
        }
      }

      const year = new Date().getFullYear();
      const rowByKey = new Map<
        string,
        { card_id: string; finish: string; year: number; price_usd: number; source: string }
      >();
      for (const item of items ?? []) {
        const prices = scryfallPrices.get(item.card_id);
        if (!prices) continue;
        const raw =
          item.finish === "foil" ? prices.usd_foil : item.finish === "etched" ? prices.usd_etched : prices.usd;
        if (!raw) continue;
        rowByKey.set(`${item.card_id}|${item.finish}`, {
          card_id: item.card_id,
          finish: item.finish,
          year,
          price_usd: parseFloat(raw),
          source: "scryfall",
        });
      }
      const rows = [...rowByKey.values()];

      if (rows.length) {
        const { error } = await supabase
          .from("price_history")
          .upsert(rows, { onConflict: "card_id,finish,year,source" });
        if (error) throw error;
      }
      setSyncMessage(`Updated ${rows.length} price${rows.length === 1 ? "" : "s"} for ${year}.`);
      applyCollectionData(await fetchCollectionData());
    } catch (err) {
      setSyncMessage(err instanceof Error ? `Sync failed: ${err.message}` : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  // Parent/children — strictly in Scryfall's original order.
  const { childrenOfCode } = useMemo(() => {
    const childrenMap = new Map<string, string[]>();
    let lastRoot: string | null = null;
    for (const s of sets) {
      const code = s.c.toLowerCase();
      if (s.i) {
        if (lastRoot) {
          if (!childrenMap.has(lastRoot)) childrenMap.set(lastRoot, []);
          childrenMap.get(lastRoot)!.push(code);
        }
      } else {
        lastRoot = code;
      }
    }
    return { childrenOfCode: childrenMap };
  }, [sets]);

  const byCode = useMemo(() => {
    const map = new Map<string, ParsedSet>();
    for (const s of sets) map.set(s.c.toLowerCase(), s);
    return map;
  }, [sets]);

  const groups = useMemo(() => {
    return sets
      .filter((s) => !s.i)
      .map((parent) => ({
        parent,
        children: (childrenOfCode.get(parent.c.toLowerCase()) ?? [])
          .map((code) => byCode.get(code))
          .filter((s): s is ParsedSet => !!s),
      }));
  }, [sets, childrenOfCode, byCode]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    function sortValue(s: ParsedSet): number | string {
      if (sortKey === "q") return ownedQtyByCode?.get(s.c.toLowerCase()) ?? 0;
      if (sortKey === "value") return valueByCode?.get(s.c.toLowerCase()) ?? 0;
      return s[sortKey].toLowerCase();
    }

    function matches(s: ParsedSet) {
      const matchesQuery = !q || s.n.toLowerCase().includes(q) || s.c.toLowerCase().includes(q);
      const matchesOwned =
        !onlyOwned || !ownedQtyByCode || (ownedQtyByCode.get(s.c.toLowerCase()) ?? 0) > 0;
      return matchesQuery && matchesOwned;
    }

    const visibleGroups = groups.filter(
      (g) => matches(g.parent) || g.children.some(matches)
    );

    const sortedGroups = [...visibleGroups].sort((a, b) => {
      const av = sortValue(a.parent);
      const bv = sortValue(b.parent);
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });

    return sortedGroups.flatMap((g) => [
      { set: g.parent, isChild: false },
      ...g.children.map((c) => ({ set: c, isChild: true })),
    ]);
  }, [groups, query, onlyOwned, ownedQtyByCode, sortKey, sortDir, valueByCode]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === 1 ? "▲" : "▾";
  }

  const totalValue = useMemo(() => {
    if (!valueByCode) return 0;
    let sum = 0;
    for (const v of valueByCode.values()) sum += v;
    return sum;
  }, [valueByCode]);

  const totalCollected = useMemo(() => {
    if (!ownedQtyByCode) return 0;
    let sum = 0;
    for (const v of ownedQtyByCode.values()) sum += v;
    return sum;
  }, [ownedQtyByCode]);

  const setsWithCards = useMemo(() => {
    if (!ownedQtyByCode) return 0;
    let n = 0;
    for (const v of ownedQtyByCode.values()) if (v > 0) n++;
    return n;
  }, [ownedQtyByCode]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-5xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncPrices}
              disabled={syncing}
              title="Pull current USD prices from Scryfall for cards in your collection"
              className="rounded-lg border border-zinc-800 px-3 py-2 text-[13px] font-medium text-zinc-300 hover:border-indigo-400 hover:text-indigo-400 disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync prices"}
            </button>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by set name or code…"
              className="w-56 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[13.5px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
            />
            <form action="/mtg/search" method="get">
              <label htmlFor="card-search" className="sr-only">
                Search for Magic cards
              </label>
              <input
                id="card-search"
                name="q"
                type="text"
                placeholder="Search for Magic cards…"
                autoComplete="off"
                className="w-56 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[13.5px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
              />
            </form>
          </div>

          <div className="inline-flex rounded-lg border border-zinc-800 p-0.5 text-[12.5px]">
            <Link
              href="/mtg"
              className={`rounded-md px-3 py-1 font-medium ${
                !onlyOwned ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All sets
            </Link>
            <Link
              href="/mtg?collection=1"
              className={`rounded-md px-3 py-1 font-medium ${
                onlyOwned ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Only mine
            </Link>
          </div>
        </div>

        {syncMessage && <p className="mt-3 text-sm text-zinc-400">{syncMessage}</p>}

        <div className="mt-6 grid grid-cols-3 overflow-hidden rounded-lg border border-zinc-800">
          <div className="border-l border-zinc-800 p-4 first:border-l-0">
            <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
              ${totalValue.toFixed(2)}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">Collection value</div>
          </div>
          <div className="border-l border-zinc-800 p-4">
            <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">
              {totalCollected}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">Cards collected</div>
          </div>
          <div className="border-l border-zinc-800 p-4">
            <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">
              {setsWithCards}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">Sets with cards</div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-[1fr_90px_100px_100px_88px] items-center gap-2 border-b border-zinc-700 px-1 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <div>Name</div>
          <div className="text-right">
            <button onClick={() => toggleSort("q")} className="inline-flex items-center gap-1 hover:text-zinc-200">
              Collected <span className="text-[10px] opacity-70">{sortArrow("q")}</span>
            </button>
          </div>
          <div className="text-right">
            <button onClick={() => toggleSort("value")} className="inline-flex items-center gap-1 hover:text-zinc-200">
              Value <span className="text-[10px] opacity-70">{sortArrow("value")}</span>
            </button>
          </div>
          <div className="text-right">
            <button onClick={() => toggleSort("d")} className="inline-flex items-center gap-1 hover:text-zinc-200">
              Released <span className="text-[10px] opacity-70">{sortArrow("d")}</span>
            </button>
          </div>
          <div className="text-right">Reports</div>
        </div>

        <div>
          {rows.map(({ set: s, isChild }) => {
            const collected = ownedQtyByCode?.get(s.c.toLowerCase()) ?? 0;
            const value = valueByCode?.get(s.c.toLowerCase()) ?? 0;
            return (
              <div
                key={s.c}
                className="group grid grid-cols-[1fr_90px_100px_100px_88px] items-center gap-2 border-b border-zinc-800 px-1 py-3 hover:bg-zinc-950/60"
              >
                <Link
                  href={`/mtg/sets/${s.c.toLowerCase()}`}
                  className={`flex min-w-0 items-center gap-2 ${isChild ? "relative pl-6 before:absolute before:left-2.5 before:top-[-13px] before:bottom-1/2 before:w-px before:bg-zinc-800" : ""}`}
                >
                  <svg
                    viewBox={s.viewBox}
                    className={`flex-shrink-0 fill-zinc-500 ${isChild ? "h-3.5 w-3.5 opacity-60" : "h-4 w-4 opacity-90"}`}
                    dangerouslySetInnerHTML={{ __html: s.pathsHtml }}
                  />
                  <span
                    className={`truncate ${
                      isChild
                        ? "text-[13px] text-zinc-500 group-hover:text-indigo-400"
                        : "text-[13.5px] font-medium text-zinc-100 group-hover:text-indigo-400"
                    }`}
                  >
                    {s.n}
                  </span>
                  <span className="flex-shrink-0 font-mono text-[10.5px] tracking-wide text-zinc-600">
                    {s.c}
                  </span>
                </Link>
                <div className={`text-right font-mono text-[13px] tabular-nums ${collected ? "text-zinc-100" : "text-zinc-700"}`}>
                  {collected}
                </div>
                <div className={`text-right font-mono text-[13px] tabular-nums ${value ? "text-emerald-400" : "text-zinc-700"}`}>
                  ${value.toFixed(2)}
                </div>
                <div className="text-right font-mono text-xs tabular-nums text-zinc-500">
                  {s.d}
                </div>
                <div className="flex justify-end">
                  <Link
                    href={`/mtg/reports/sets?set=${s.c.toLowerCase()}`}
                    title="Set Value for this set"
                    className="flex h-6 w-6 items-center justify-center rounded text-zinc-600 hover:text-indigo-400"
                  >
                    $
                  </Link>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">No results</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}
