"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import setsData from "@/data/sets.json";
import { parseSet, type RawSet } from "@/lib/setIcon";
import { supabase } from "@/lib/supabaseClient";
import { HistoryChart } from "@/components/HistoryChart";
import { effectivePriceMap, priceKey } from "@/lib/priceHistory";

const LATEST_YEAR = 2026;
const YEARS = Array.from({ length: 12 }, (_, i) => 2015 + i); // 2015..2026
const ROW_GRID = "grid-cols-[1fr_70px_90px_70px]";

type SetStat = {
  code: string;
  cards: number;
  value: number;
  byYear: Record<number, number>;
};

type Group = {
  code: string;
  own: SetStat;
  children: SetStat[];
  total: SetStat;
};

type SortKey = "name" | "cards" | "value";

function emptyStat(code: string): SetStat {
  return { code, cards: 0, value: 0, byYear: {} };
}

function sumStats(code: string, stats: SetStat[]): SetStat {
  const total = emptyStat(code);
  for (const s of stats) {
    total.cards += s.cards;
    total.value += s.value;
    for (const year of YEARS) {
      total.byYear[year] = (total.byYear[year] ?? 0) + (s.byYear[year] ?? 0);
    }
  }
  return total;
}

function SetValueInner() {
  const params = useSearchParams();
  const filterSet = params.get("set")?.toLowerCase() || null;

  const [stats, setStats] = useState<SetStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: items, error: itemsErr } = await supabase
        .from("collection_items")
        .select("card_id,finish,quantity");
      if (itemsErr) {
        if (!cancelled) setError(itemsErr.message);
        return;
      }
      if (!items || items.length === 0) {
        if (!cancelled) setStats([]);
        return;
      }

      const cardIds = [...new Set(items.map((i) => i.card_id))];

      const { data: cards, error: cardsErr } = await supabase
        .from("cards")
        .select("id,set_code")
        .in("id", cardIds);
      if (cardsErr) {
        if (!cancelled) setError(cardsErr.message);
        return;
      }
      const setCodeByCard = new Map(cards.map((c) => [c.id, c.set_code]));

      const { data: prices, error: pricesErr } = await supabase
        .from("price_history")
        .select("card_id,finish,year,price_usd,source")
        .in("card_id", cardIds);
      if (pricesErr) {
        if (!cancelled) setError(pricesErr.message);
        return;
      }
      const priceMap = effectivePriceMap(prices ?? []);

      const bySet = new Map<string, SetStat>();
      for (const item of items) {
        const setCode = setCodeByCard.get(item.card_id);
        if (!setCode) continue;

        if (!bySet.has(setCode)) {
          bySet.set(setCode, emptyStat(setCode));
        }
        const stat = bySet.get(setCode)!;
        stat.cards += item.quantity;

        for (const year of YEARS) {
          const price = priceMap.get(priceKey(item.card_id, item.finish, year)) ?? 0;
          stat.byYear[year] = (stat.byYear[year] ?? 0) + price * item.quantity;
        }
        stat.value = stat.byYear[LATEST_YEAR] ?? 0;
      }

      if (!cancelled) setStats([...bySet.values()]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const { setInfoByCode, parentOfCode, childrenOfCode } = useMemo(() => {
    const infoMap = new Map<string, ReturnType<typeof parseSet>>();
    const parentMap = new Map<string, string | null>();
    const childrenMap = new Map<string, string[]>();
    let lastRoot: string | null = null;
    for (const raw of setsData as RawSet[]) {
      const code = raw.c.toLowerCase();
      infoMap.set(code, parseSet(raw));
      if (raw.i) {
        parentMap.set(code, lastRoot);
        if (lastRoot) {
          if (!childrenMap.has(lastRoot)) childrenMap.set(lastRoot, []);
          childrenMap.get(lastRoot)!.push(code);
        }
      } else {
        parentMap.set(code, null);
        lastRoot = code;
      }
    }
    return { setInfoByCode: infoMap, parentOfCode: parentMap, childrenOfCode: childrenMap };
  }, []);

  const groups = useMemo(() => {
    if (!stats) return [];
    const byCode = new Map(stats.map((s) => [s.code, s]));

    if (filterSet) {
      const rootCode = parentOfCode.get(filterSet) ?? filterSet;
      const own = byCode.get(rootCode) ?? emptyStat(rootCode);
      const children = (childrenOfCode.get(rootCode) ?? []).map(
        (code) => byCode.get(code) ?? emptyStat(code)
      );
      const total = sumStats(rootCode, [own, ...children]);
      return [{ code: rootCode, own, children, total }];
    }

    const groupMap = new Map<string, { own?: SetStat; children: SetStat[] }>();
    for (const stat of stats) {
      const parent = parentOfCode.get(stat.code) ?? null;
      const rootCode = parent ?? stat.code;
      if (!groupMap.has(rootCode)) groupMap.set(rootCode, { children: [] });
      const g = groupMap.get(rootCode)!;
      if (rootCode === stat.code) {
        g.own = stat;
      } else {
        g.children.push(stat);
      }
    }

    const result: Group[] = [];
    for (const [code, g] of groupMap) {
      const own = g.own ?? emptyStat(code);
      const total = sumStats(code, [own, ...g.children]);
      result.push({ code, own, children: g.children, total });
    }
    return result;
  }, [stats, parentOfCode, childrenOfCode, filterSet]);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "name") {
        av = (setInfoByCode.get(a.code)?.n ?? a.code).toLowerCase();
        bv = (setInfoByCode.get(b.code)?.n ?? b.code).toLowerCase();
      } else if (sortKey === "cards") {
        av = a.total.cards;
        bv = b.total.cards;
      } else {
        av = a.total.value;
        bv = b.total.value;
      }
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
  }, [groups, sortKey, sortDir, setInfoByCode]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? 1 : -1);
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === 1 ? "▲" : "▾";
  }

  function renderRow(stat: SetStat, isChild: boolean) {
    const info = setInfoByCode.get(stat.code);
    const historyKey = stat.code + (isChild ? "" : ":total");
    const isOpen = openHistory === historyKey;
    return (
      <Fragment key={historyKey}>
        <div className={`grid ${ROW_GRID} items-center gap-2 border-b border-zinc-800 px-1 py-2.5`}>
          <div className={`flex min-w-0 items-center gap-2 ${isChild ? "relative pl-6" : ""}`}>
            {isChild && (
              <span className="absolute left-2.5 top-[-11px] bottom-1/2 w-px bg-zinc-800" />
            )}
            {info && (
              <svg
                viewBox={info.viewBox}
                className={`flex-shrink-0 fill-zinc-500 ${isChild ? "h-3.5 w-3.5 opacity-60" : "h-4 w-4 opacity-90"}`}
                dangerouslySetInnerHTML={{ __html: info.pathsHtml }}
              />
            )}
            <span className={`truncate ${isChild ? "text-[13px] text-zinc-500" : "text-[13.5px] font-medium text-zinc-100"}`}>
              {info?.n ?? stat.code.toUpperCase()}
            </span>
            <span className="flex-shrink-0 font-mono text-[10.5px] text-zinc-600">{stat.code.toUpperCase()}</span>
          </div>
          <div className="text-right font-mono text-[13px] tabular-nums text-zinc-100">{stat.cards}</div>
          <div className="text-right font-mono text-[13px] tabular-nums text-emerald-400">
            ${stat.value.toFixed(2)}
          </div>
          <div className="text-right">
            <button
              onClick={() => setOpenHistory((cur) => (cur === historyKey ? null : historyKey))}
              className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-indigo-400 hover:text-indigo-400"
            >
              {isOpen ? "Hide" : "History"}
            </button>
          </div>
        </div>
        {isOpen && (
          <div className="border-b border-zinc-800 bg-zinc-950/60 px-1 py-4">
            <HistoryChart series={[{ label: "Value", color: "#818cf8", byYear: stat.byYear }]} years={YEARS} />
          </div>
        )}
      </Fragment>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-5xl">
        {filterSet && (
          <Link href="/mtg/reports/sets" className="text-xs text-zinc-500 hover:text-indigo-400">
            ← All sets
          </Link>
        )}

        <div className={`${filterSet ? "mt-4" : ""} grid ${ROW_GRID} items-center gap-2 border-b border-zinc-700 px-1 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500`}>
          <button onClick={() => toggleSort("name")} className="text-left hover:text-zinc-200">
            Name <span className="text-[10px] opacity-70">{sortArrow("name")}</span>
          </button>
          <button onClick={() => toggleSort("cards")} className="text-right hover:text-zinc-200">
            Cards <span className="text-[10px] opacity-70">{sortArrow("cards")}</span>
          </button>
          <button onClick={() => toggleSort("value")} className="text-right hover:text-zinc-200">
            Value <span className="text-[10px] opacity-70">{sortArrow("value")}</span>
          </button>
          <div className="text-right">History</div>
        </div>

        <div>
          {sortedGroups.map((g) => (
            <Fragment key={g.code}>
              {renderRow(g.total, false)}
              {g.children
                .slice()
                .sort((a, b) => b.value - a.value)
                .map((child) => renderRow(child, true))}
            </Fragment>
          ))}
          {sortedGroups.length === 0 && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">
              {stats === null ? "Loading…" : "No cards in your collection yet"}
            </div>
          )}
          {error && <div className="px-1 py-10 text-center text-sm text-red-400">Failed to load: {error}</div>}
        </div>
      </div>
    </div>
  );
}

export default function SetValuePage() {
  return (
    <Suspense>
      <SetValueInner />
    </Suspense>
  );
}
