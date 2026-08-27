"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import setsData from "@/data/sets.json";
import { parseSet, type RawSet } from "@/lib/setIcon";
import { supabase } from "@/lib/supabaseClient";

const LATEST_YEAR = 2026;
const YEARS = Array.from({ length: 12 }, (_, i) => 2015 + i); // 2015..2026

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
        .select("card_id,finish,year,price_usd")
        .in("card_id", cardIds);
      if (pricesErr) {
        if (!cancelled) setError(pricesErr.message);
        return;
      }
      const priceMap = new Map<string, number>();
      for (const p of prices ?? []) {
        priceMap.set(`${p.card_id}|${p.finish}|${p.year}`, p.price_usd);
      }

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
          const price = priceMap.get(`${item.card_id}|${item.finish}|${year}`) ?? 0;
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
    return sortDir === 1 ? "▲" : "▼";
  }

  function renderRow(stat: SetStat, isChild: boolean) {
    const info = setInfoByCode.get(stat.code);
    const historyKey = stat.code + (isChild ? "" : ":total");
    return (
      <Fragment key={historyKey}>
        <tr className="border-b border-zinc-100 last:border-0 hover:bg-stone-200 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
          <td className="px-4 py-2.5">
            <div
              className={`flex items-center gap-2 ${
                isChild
                  ? "relative pl-6 before:absolute before:left-2.5 before:top-0 before:bottom-0 before:w-px before:bg-zinc-200 dark:before:bg-zinc-800"
                  : ""
              }`}
            >
              {info && (
                <svg
                  viewBox={info.viewBox}
                  className={`flex-shrink-0 fill-zinc-500 dark:fill-zinc-400 ${
                    isChild ? "h-3.5 w-3.5 opacity-70" : "h-4 w-4 opacity-85"
                  }`}
                  dangerouslySetInnerHTML={{ __html: info.pathsHtml }}
                />
              )}
              <span
                className={
                  isChild
                    ? "text-zinc-500 dark:text-zinc-400"
                    : "font-medium text-zinc-900 dark:text-zinc-100"
                }
              >
                {info?.n ?? stat.code.toUpperCase()}
              </span>
              <span className="whitespace-nowrap rounded bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                {stat.code.toUpperCase()}
              </span>
            </div>
          </td>
          <td className="px-4 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
            {stat.cards}
          </td>
          <td className="px-4 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
            ${stat.value.toFixed(2)}
          </td>
          <td className="px-4 py-2.5">
            <button
              onClick={() => setOpenHistory((cur) => (cur === historyKey ? null : historyKey))}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
            >
              {openHistory === historyKey ? "Hide" : "History"}
            </button>
          </td>
        </tr>
        {openHistory === historyKey && (
          <tr className="border-b border-zinc-100 bg-stone-200 dark:border-zinc-800/60 dark:bg-zinc-800/30">
            <td colSpan={4} className="px-4 py-4">
              <HistoryChart byYear={stat.byYear} />
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-4xl">
        <Link
          href={filterSet ? "/reports/sets" : "/reports"}
          className="text-xs text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400"
        >
          {filterSet ? "← All sets" : "← Reports"}
        </Link>

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-stone-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-sm font-bold text-zinc-900 dark:border-zinc-800">
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("name")}
                  >
                    Name <span className="text-[9px] opacity-60">{sortArrow("name")}</span>
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("cards")}
                  >
                    Cards <span className="text-[9px] opacity-60">{sortArrow("cards")}</span>
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("value")}
                  >
                    Value <span className="text-[9px] opacity-60">{sortArrow("value")}</span>
                  </th>
                  <th className="px-4 py-3 font-medium">History</th>
                </tr>
              </thead>
              <tbody>
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
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-zinc-400">
                      {stats === null ? "Loading…" : "No cards in your collection yet"}
                    </td>
                  </tr>
                )}
                {error && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-red-500">
                      Failed to load: {error}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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

function HistoryChart({ byYear }: { byYear: Record<number, number> }) {
  const width = 480;
  const height = 160;
  const padding = 28;

  const values = YEARS.map((y) => byYear[y] ?? 0);
  const max = Math.max(...values, 0.01);

  const points = YEARS.map((year, i) => {
    const x = padding + (i / (YEARS.length - 1)) * (width - padding * 2);
    const y = height - padding - (values[i] / max) * (height - padding * 2);
    return { x, y, year, value: values[i] };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <svg width={width} height={height} className="max-w-full">
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        className="stroke-zinc-300 dark:stroke-zinc-700"
      />
      <path d={path} fill="none" className="stroke-indigo-500" strokeWidth={2} />
      {points.map((p) => (
        <g key={p.year}>
          <circle cx={p.x} cy={p.y} r={2.5} className="fill-indigo-500" />
          {(p.year % 2 === 1 || p.year === YEARS[YEARS.length - 1]) && (
            <text
              x={p.x}
              y={height - padding + 14}
              textAnchor="middle"
              className="fill-zinc-400 text-[9px] dark:fill-zinc-500"
            >
              {p.year}
            </text>
          )}
          <title>
            {p.year}: ${p.value.toFixed(2)}
          </title>
        </g>
      ))}
    </svg>
  );
}
