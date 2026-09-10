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
const ROW_GRID = "grid-cols-[1fr_170px_40px_44px_140px_60px_60px]";

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
      setError("Failed to add: " + error?.message);
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
        setError("Failed to delete: " + error.message);
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
      setError("Failed to update: " + error.message);
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
      <div className="w-full max-w-5xl">
        <p className="text-sm text-zinc-500">
          {q ? (
            <>
              Results for <span className="text-zinc-300">&ldquo;{q}&rdquo;</span>
            </>
          ) : (
            "Enter a card name in the search box above"
          )}
        </p>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        {results && results.length > 0 && (
          <div className={`mt-6 grid ${ROW_GRID} items-center gap-2 border-b border-zinc-700 px-1 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500`}>
            <div>Name</div>
            <div>Set</div>
            <div>№</div>
            <div></div>
            <div>Finishes</div>
            <div>Promo</div>
            <div></div>
          </div>
        )}

        <div>
          {(results ?? []).map((c) => {
            const info = setInfoByCode.get(c.set_code);
            return (
              <Fragment key={c.id}>
                <div className={`grid ${ROW_GRID} items-center gap-2 border-b border-zinc-800 px-1 py-2.5`}>
                  <div className="truncate text-[13.5px] font-medium text-zinc-100">{c.name}</div>
                  <Link
                    href={`/mtg/sets/${c.set_code}`}
                    className="flex min-w-0 items-center gap-1.5 text-[13px] text-zinc-400 hover:text-indigo-400"
                  >
                    {info && (
                      <svg
                        viewBox={info.viewBox}
                        className="h-3.5 w-3.5 flex-shrink-0 fill-zinc-500"
                        dangerouslySetInnerHTML={{ __html: info.pathsHtml }}
                      />
                    )}
                    <span className="truncate">{info?.n ?? c.set_code.toUpperCase()}</span>
                    <span className="flex-shrink-0 font-mono text-[10px] text-zinc-600">
                      {c.set_code.toUpperCase()}
                    </span>
                  </Link>
                  <div className="font-mono text-[13px] tabular-nums text-zinc-500">{c.collector_number}</div>
                  <div>
                    <span
                      title={c.rarity}
                      className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                        RARITY_STYLE[c.rarity] ?? RARITY_STYLE.common
                      }`}
                    >
                      {RARITY_LABEL[c.rarity] ?? "?"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.finishes.map((f) => (
                      <span
                        key={f}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${finishStyle[f] ?? finishStyle.nonfoil}`}
                      >
                        {finishLabel[f] ?? f}
                      </span>
                    ))}
                  </div>
                  <div>
                    {c.promo && (
                      <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                        PROMO
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <button
                      onClick={() => openAdd(c)}
                      className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-indigo-400 hover:text-indigo-400"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {(collectionByCard[c.id] ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 border-b border-zinc-800 px-1 py-1.5 pl-8 text-xs"
                  >
                    <span className="text-zinc-600">↳</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => changeQuantity(c.id, item, -1)}
                        className="flex h-4 w-4 items-center justify-center rounded border border-zinc-700 text-[10px] leading-none text-zinc-400 hover:border-red-500 hover:text-red-400"
                      >
                        −
                      </button>
                      <span className="w-4 text-center font-mono text-zinc-400">{item.quantity}</span>
                      <button
                        onClick={() => changeQuantity(c.id, item, 1)}
                        className="flex h-4 w-4 items-center justify-center rounded border border-zinc-700 text-[10px] leading-none text-zinc-400 hover:border-emerald-500 hover:text-emerald-400"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-zinc-600">×</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${finishStyle[item.finish] ?? finishStyle.nonfoil}`}>
                      {finishLabel[item.finish] ?? item.finish}
                    </span>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                      {item.condition}
                    </span>
                  </div>
                ))}

                {addingId === c.id && (
                  <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-950/60 px-2 py-3">
                    <span className="text-xs text-zinc-500">{c.name}:</span>

                    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                      Finish
                      <select
                        value={addFinish}
                        onChange={(e) => setAddFinish(e.target.value)}
                        className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-400"
                      >
                        {c.finishes.map((f) => (
                          <option key={f} value={f}>
                            {finishLabel[f] ?? f}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                      Condition
                      <select
                        value={addCondition}
                        onChange={(e) => setAddCondition(e.target.value)}
                        className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-400"
                      >
                        {CONDITIONS.map((cond) => (
                          <option key={cond} value={cond}>
                            {cond}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                      Qty
                      <input
                        type="number"
                        min={1}
                        value={addQuantity}
                        onChange={(e) => setAddQuantity(parseInt(e.target.value, 10) || 1)}
                        className="w-16 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-400"
                      />
                    </label>

                    <button
                      onClick={() => submitAdd(c.id)}
                      disabled={saving}
                      className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={closeAdd} className="text-xs text-zinc-500 hover:text-zinc-300">
                      Cancel
                    </button>
                  </div>
                )}
              </Fragment>
            );
          })}
          {results && results.length === 0 && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">
              {q ? "No results" : " "}
            </div>
          )}
          {results === null && q && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">Loading…</div>
          )}
        </div>
        {results && results.length === RESULT_LIMIT && (
          <p className="mt-2 text-xs text-zinc-500">
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
