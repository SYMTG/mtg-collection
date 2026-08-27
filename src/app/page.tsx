"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import setsData from "@/data/sets.json";
import { parseSet, type RawSet, type ParsedSet } from "@/lib/setIcon";
import { supabase } from "@/lib/supabaseClient";

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

  useEffect(() => {
    supabase
      .from("collection_items")
      .select("card_id,finish,quantity,cards(set_code)")
      .then(async ({ data }) => {
        const items = (data ?? []) as unknown as {
          card_id: string;
          finish: string;
          quantity: number;
          cards: { set_code: string } | null;
        }[];

        const qtyMap = new Map<string, number>();
        for (const row of items) {
          const code = row.cards?.set_code;
          if (!code) continue;
          qtyMap.set(code, (qtyMap.get(code) ?? 0) + row.quantity);
        }
        setOwnedQtyByCode(qtyMap);

        const cardIds = [...new Set(items.map((i) => i.card_id))];
        if (cardIds.length === 0) {
          setValueByCode(new Map());
          return;
        }

        const { data: prices } = await supabase
          .from("price_history")
          .select("card_id,finish,price_usd")
          .in("card_id", cardIds)
          .eq("year", LATEST_YEAR);
        const priceMap = new Map<string, number>();
        for (const p of prices ?? []) {
          priceMap.set(`${p.card_id}|${p.finish}`, p.price_usd);
        }

        const valMap = new Map<string, number>();
        for (const row of items) {
          const code = row.cards?.set_code;
          if (!code) continue;
          const price = priceMap.get(`${row.card_id}|${row.finish}`) ?? 0;
          valMap.set(code, (valMap.get(code) ?? 0) + price * row.quantity);
        }
        setValueByCode(valMap);
      });
  }, []);

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
    return sortDir === 1 ? "▲" : "▼";
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-5xl">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by set name or code…"
            className="w-full max-w-sm rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <form action="/search" method="get" className="w-full max-w-sm">
            <label htmlFor="card-search" className="sr-only">
              Search for Magic cards
            </label>
            <input
              id="card-search"
              name="q"
              type="text"
              placeholder="Search for Magic cards…"
              autoComplete="off"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </form>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-stone-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-sm font-bold text-zinc-900 dark:border-zinc-800">
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("n")}
                  >
                    Name <span className="text-[9px] opacity-60">{sortArrow("n")}</span>
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("q")}
                  >
                    Collected <span className="text-[9px] opacity-60">{sortArrow("q")}</span>
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("value")}
                  >
                    Value <span className="text-[9px] opacity-60">{sortArrow("value")}</span>
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("d")}
                  >
                    Released <span className="text-[9px] opacity-60">{sortArrow("d")}</span>
                  </th>
                  <th className="px-4 py-3 font-medium">Reports</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ set: s, isChild }) => (
                  <tr
                    key={s.c}
                    className="border-b border-zinc-100 last:border-0 hover:bg-stone-200 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/sets/${s.c.toLowerCase()}`}
                        className={`group flex items-center gap-2 ${
                          isChild ? "relative pl-6 before:absolute before:left-2.5 before:top-0 before:bottom-0 before:w-px before:bg-zinc-200 dark:before:bg-zinc-800" : ""
                        }`}
                      >
                        <svg
                          viewBox={s.viewBox}
                          className={`flex-shrink-0 fill-zinc-500 dark:fill-zinc-400 ${
                            isChild ? "h-3.5 w-3.5 opacity-70" : "h-4 w-4 opacity-85"
                          }`}
                          dangerouslySetInnerHTML={{ __html: s.pathsHtml }}
                        />
                        <span
                          className={
                            isChild
                              ? "whitespace-nowrap text-zinc-500 group-hover:text-indigo-600 dark:text-zinc-400 dark:group-hover:text-indigo-400"
                              : "whitespace-nowrap font-medium text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400"
                          }
                        >
                          {s.n}
                        </span>
                        <span className="whitespace-nowrap rounded bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                          {s.c}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {ownedQtyByCode?.get(s.c.toLowerCase()) ?? 0}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      ${(valueByCode?.get(s.c.toLowerCase()) ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-zinc-500 dark:text-zinc-400">
                      {s.d}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Link
                          href={`/reports/sets?set=${s.c.toLowerCase()}`}
                          title="Set Value for this set"
                          className="flex h-6 w-[27px] items-center justify-center rounded border border-zinc-200 bg-stone-100 text-[9.5px] font-bold text-zinc-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
                        >
                          $
                        </Link>
                        {["UP", "DN", "ALL"].map((label) => (
                          <div
                            key={label}
                            title="No collection data"
                            className="flex h-6 w-[27px] cursor-not-allowed items-center justify-center rounded border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                      No results
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

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}
