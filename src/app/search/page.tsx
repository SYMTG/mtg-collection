"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import setsData from "@/data/sets.json";
import { parseSet, type RawSet } from "@/lib/setIcon";
import { supabase } from "@/lib/supabaseClient";
import {
  RARITY_LABEL,
  RARITY_STYLE,
  finishLabel,
  finishStyle,
  CONDITIONS,
  type CollectionEntry,
} from "@/lib/cardDisplay";

type CardRow = {
  id: string;
  name: string;
  set_code: string;
  collector_number: string;
  rarity: string;
  finishes: string[];
  promo: boolean;
};

const RESULT_LIMIT = 200;

function SearchResults() {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();

  const [results, setResults] = useState<CardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collectionByCard, setCollectionByCard] = useState<Record<string, CollectionEntry[]>>({});

  const [addingId, setAddingId] = useState<string | null>(null);
  const [addFinish, setAddFinish] = useState("");
  const [addCondition, setAddCondition] = useState("NM");
  const [addQuantity, setAddQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  // Reset per-query state during render (not in the effect) when the search
  // query changes, so the effect below only ever performs the fetch.
  const [loadedFor, setLoadedFor] = useState(q);
  if (loadedFor !== q) {
    setLoadedFor(q);
    setError(null);
    setCollectionByCard({});
    setResults(q ? null : []);
  }

  useEffect(() => {
    if (!q) return;
    let cancelled = false;

    supabase
      .from("cards")
      .select("id,name,set_code,collector_number,rarity,finishes,promo")
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(RESULT_LIMIT)
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          return;
        }
        setResults(data ?? []);

        const ids = (data ?? []).map((c) => c.id);
        if (ids.length === 0) return;

        const { data: items } = await supabase
          .from("collection_items")
          .select("id,card_id,finish,condition,quantity")
          .in("card_id", ids);

        if (cancelled || !items) return;
        const grouped: Record<string, CollectionEntry[]> = {};
        for (const item of items) {
          (grouped[item.card_id] ??= []).push(item);
        }
        setCollectionByCard(grouped);
      });

    return () => {
      cancelled = true;
    };
  }, [q]);

  const setInfoByCode = useMemo(() => {
    const map = new Map<string, ReturnType<typeof parseSet>>();
    for (const raw of setsData as RawSet[]) {
      map.set(raw.c.toLowerCase(), parseSet(raw));
    }
    return map;
  }, []);

  function openAdd(c: CardRow) {
    setAddingId(c.id);
    setAddFinish(c.finishes[0] ?? "nonfoil");
    setAddCondition("NM");
    setAddQuantity(1);
  }

  function closeAdd() {
    setAddingId(null);
  }

  async function submitAdd(cardId: string) {
    setSaving(true);
    const { data, error } = await supabase
      .from("collection_items")
      .insert({
        card_id: cardId,
        finish: addFinish,
        condition: addCondition,
        quantity: addQuantity,
      })
      .select()
      .single();
    setSaving(false);
    if (error || !data) {
      alert("Failed to add: " + error?.message);
      return;
    }
    setAddingId(null);
    setCollectionByCard((prev) => ({
      ...prev,
      [cardId]: [...(prev[cardId] ?? []), data],
    }));
  }

  async function changeQuantity(cardId: string, item: CollectionEntry, delta: number) {
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      const { error } = await supabase.from("collection_items").delete().eq("id", item.id);
      if (error) {
        alert("Failed to delete: " + error.message);
        return;
      }
      setCollectionByCard((prev) => ({
        ...prev,
        [cardId]: (prev[cardId] ?? []).filter((i) => i.id !== item.id),
      }));
      return;
    }

    const { error } = await supabase
      .from("collection_items")
      .update({ quantity: newQty })
      .eq("id", item.id);
    if (error) {
      alert("Failed to update: " + error.message);
      return;
    }
    setCollectionByCard((prev) => ({
      ...prev,
      [cardId]: (prev[cardId] ?? []).map((i) =>
        i.id === item.id ? { ...i, quantity: newQty } : i
      ),
    }));
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-4xl">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-stone-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-sm font-bold text-zinc-900 dark:border-zinc-800">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Set</th>
                  <th className="px-4 py-3 font-medium">№</th>
                  <th className="px-4 py-3 font-medium">Rarity</th>
                  <th className="px-4 py-3 font-medium">Finishes</th>
                  <th className="px-4 py-3 font-medium">Promo</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(results ?? []).map((c) => {
                  const info = setInfoByCode.get(c.set_code);
                  return (
                    <Fragment key={c.id}>
                      <tr className="border-b border-zinc-100 last:border-0 hover:bg-stone-200 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
                        <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                          {c.name}
                        </td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/sets/${c.set_code}`}
                            className="flex items-center gap-1.5 text-zinc-600 hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400"
                          >
                            {info && (
                              <svg
                                viewBox={info.viewBox}
                                className="h-3.5 w-3.5 flex-shrink-0 fill-zinc-500 dark:fill-zinc-400"
                                dangerouslySetInnerHTML={{ __html: info.pathsHtml }}
                              />
                            )}
                            <span className="whitespace-nowrap">{info?.n ?? c.set_code.toUpperCase()}</span>
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                              {c.set_code.toUpperCase()}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                          {c.collector_number}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            title={c.rarity}
                            className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                              RARITY_STYLE[c.rarity] ?? RARITY_STYLE.common
                            }`}
                          >
                            {RARITY_LABEL[c.rarity] ?? "?"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {c.finishes.map((f) => (
                              <span
                                key={f}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  finishStyle[f] ?? finishStyle.nonfoil
                                }`}
                              >
                                {finishLabel[f] ?? f}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {c.promo && (
                            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                              PROMO
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => openAdd(c)}
                            className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
                          >
                            + Add
                          </button>
                        </td>
                      </tr>

                      {(collectionByCard[c.id] ?? []).map((item) => (
                        <tr key={item.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                          <td></td>
                          <td className="px-4 py-2 pl-6" colSpan={2}>
                            <div className="relative flex items-center gap-2 pl-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
                              <span className="text-zinc-400 dark:text-zinc-600">↳</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => changeQuantity(c.id, item, -1)}
                                  className="flex h-4 w-4 items-center justify-center rounded border border-zinc-300 text-[10px] leading-none text-zinc-500 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-500 dark:hover:text-red-400"
                                >
                                  −
                                </button>
                                <span className="w-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() => changeQuantity(c.id, item, 1)}
                                  className="flex h-4 w-4 items-center justify-center rounded border border-zinc-300 text-[10px] leading-none text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
                                >
                                  +
                                </button>
                              </div>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">×</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  finishStyle[item.finish] ?? finishStyle.nonfoil
                                }`}
                              >
                                {finishLabel[item.finish] ?? item.finish}
                              </span>
                              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                {item.condition}
                              </span>
                            </div>
                          </td>
                          <td colSpan={4}></td>
                        </tr>
                      ))}

                      {addingId === c.id && (
                        <tr className="border-b border-zinc-100 bg-stone-200 dark:border-zinc-800/60 dark:bg-zinc-800/30">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">{c.name}:</span>

                              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                                Finish
                                <select
                                  value={addFinish}
                                  onChange={(e) => setAddFinish(e.target.value)}
                                  className="rounded border border-zinc-300 bg-stone-100 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                  {c.finishes.map((f) => (
                                    <option key={f} value={f}>
                                      {finishLabel[f] ?? f}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                                Condition
                                <select
                                  value={addCondition}
                                  onChange={(e) => setAddCondition(e.target.value)}
                                  className="rounded border border-zinc-300 bg-stone-100 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                  {CONDITIONS.map((cond) => (
                                    <option key={cond} value={cond}>
                                      {cond}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                                Qty
                                <input
                                  type="number"
                                  min={1}
                                  value={addQuantity}
                                  onChange={(e) => setAddQuantity(parseInt(e.target.value, 10) || 1)}
                                  className="w-16 rounded border border-zinc-300 bg-stone-100 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                                />
                              </label>

                              <button
                                onClick={() => submitAdd(c.id)}
                                disabled={saving}
                                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                              >
                                {saving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={closeAdd}
                                className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {results && results.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                      {q ? "No results" : "Enter a card name in the search box above"}
                    </td>
                  </tr>
                )}
                {results === null && q && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {error && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-red-500">
                      Failed to load: {error}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {results && results.length === RESULT_LIMIT && (
          <p className="mt-2 text-xs text-zinc-400">
            Showing the first {RESULT_LIMIT} results — refine your search
          </p>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  );
}
