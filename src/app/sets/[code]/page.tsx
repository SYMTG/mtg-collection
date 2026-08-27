"use client";

import { Fragment, use, useEffect, useMemo, useState } from "react";
import setsData from "@/data/sets.json";
import { parseSet, type RawSet } from "@/lib/setIcon";
import { supabase } from "@/lib/supabaseClient";
import {
  RARITY_RANK,
  RARITY_LABEL,
  RARITY_STYLE,
  finishLabel,
  finishStyle,
  CONDITIONS,
  BORDER_STYLE,
  borderLabel,
  type CollectionEntry,
} from "@/lib/cardDisplay";

type CardRow = {
  id: string;
  name: string;
  collector_number: string;
  rarity: string;
  finishes: string[];
  promo: boolean;
  border_color: string | null;
  full_art: boolean;
  frame_effects: string[] | null;
};

type SortKey = "collector_number" | "name" | "rarity";

export default function SetPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);

  const setInfo = useMemo(() => {
    const raw = (setsData as RawSet[]).find(
      (s) => s.c.toLowerCase() === code.toLowerCase()
    );
    return raw ? parseSet(raw) : null;
  }, [code]);

  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("rarity");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const [addingId, setAddingId] = useState<string | null>(null);
  const [addFinish, setAddFinish] = useState("");
  const [addCondition, setAddCondition] = useState("NM");
  const [addQuantity, setAddQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  const [collectionByCard, setCollectionByCard] = useState<Record<string, CollectionEntry[]>>({});
  const [collectionValue, setCollectionValue] = useState<number | null>(null);

  // Reset per-set state during render (not in the effect) when the route's
  // `code` changes, so the effect below only ever performs the fetch.
  const [loadedFor, setLoadedFor] = useState(code);
  if (loadedFor !== code) {
    setLoadedFor(code);
    setCards(null);
    setError(null);
    setCollectionByCard({});
    setCollectionValue(null);
  }

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("cards")
      .select("id,name,collector_number,rarity,finishes,promo,border_color,full_art,frame_effects")
      .eq("set_code", code.toLowerCase())
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          return;
        }
        setCards(data ?? []);

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

        if (items.length === 0) {
          setCollectionValue(0);
          return;
        }
        const { data: prices } = await supabase
          .from("price_history")
          .select("card_id,finish,price_usd")
          .in("card_id", ids)
          .eq("year", 2026);
        if (cancelled) return;
        const priceMap = new Map<string, number>();
        for (const p of prices ?? []) {
          priceMap.set(`${p.card_id}|${p.finish}`, p.price_usd);
        }
        const total = items.reduce(
          (sum, item) => sum + (priceMap.get(`${item.card_id}|${item.finish}`) ?? 0) * item.quantity,
          0
        );
        setCollectionValue(total);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const sorted = useMemo(() => {
    if (!cards) return [];
    return [...cards].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "rarity") {
        av = RARITY_RANK[a.rarity] ?? -1;
        bv = RARITY_RANK[b.rarity] ?? -1;
      } else if (sortKey === "collector_number") {
        av = parseInt(a.collector_number, 10);
        bv = parseInt(b.collector_number, 10);
        if (Number.isNaN(av)) av = a.collector_number;
        if (Number.isNaN(bv)) bv = b.collector_number;
      } else {
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
      }
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
  }, [cards, sortKey, sortDir]);

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
        <div className="rounded-xl px-5 py-4 shadow-md" style={{ backgroundColor: "#5F4F66" }}>
          <div className="flex items-center gap-2">
            {setInfo && (
              <svg
                viewBox={setInfo.viewBox}
                className="h-6 w-6 flex-shrink-0"
                style={{ fill: "#FDFDFD" }}
                dangerouslySetInnerHTML={{ __html: setInfo.pathsHtml }}
              />
            )}
            <h1 className="text-xl font-bold" style={{ color: "#FDFDFD" }}>
              {setInfo ? setInfo.n : code.toUpperCase()} ({code.toUpperCase()})
            </h1>
          </div>
          <p
            className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            {setInfo && <span>{setInfo.q} Set cards</span>}
            {setInfo && <span style={{ color: "rgba(255,255,255,0.5)" }}>•</span>}
            {setInfo && <span>Released {setInfo.d}</span>}
            <span style={{ color: "rgba(255,255,255,0.5)" }}>•</span>
            <span className="font-semibold" style={{ color: "#FDFDFD" }}>
              {collectionValue === null ? "Loading…" : `$${collectionValue.toFixed(2)}`}
            </span>
          </p>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-stone-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-sm font-bold text-zinc-900 dark:border-zinc-800">
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("collector_number")}
                  >
                    № <span className="text-[9px] opacity-60">{sortArrow("collector_number")}</span>
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("name")}
                  >
                    Name <span className="text-[9px] opacity-60">{sortArrow("name")}</span>
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => toggleSort("rarity")}
                  >
                    Rarity <span className="text-[9px] opacity-60">{sortArrow("rarity")}</span>
                  </th>
                  <th className="px-4 py-3 font-medium">Border</th>
                  <th className="px-4 py-3 font-medium">Finishes</th>
                  <th className="px-4 py-3 font-medium">Promo</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <Fragment key={c.id}>
                  <tr
                    className="border-b border-zinc-100 last:border-0 hover:bg-stone-200 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-4 py-2.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                      {c.collector_number}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                      {c.name}
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
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          BORDER_STYLE[borderLabel(c)] ?? BORDER_STYLE.Regular
                        }`}
                      >
                        {borderLabel(c)}
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
                    <tr
                      key={item.id}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                    >
                      <td></td>
                      <td className="px-4 py-2 pl-6">
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
                      <td colSpan={5}></td>
                    </tr>
                  ))}
                  {addingId === c.id && (
                    <tr className="border-b border-zinc-100 bg-stone-200 dark:border-zinc-800/60 dark:bg-zinc-800/30">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {c.name}:
                          </span>

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
                ))}
                {cards && cards.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                      No cards found
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
      </div>
    </div>
  );
}
