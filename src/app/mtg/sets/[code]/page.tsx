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

const ROW_GRID = "grid-cols-[40px_1fr_44px_92px_140px_60px_60px]";
const OWNED_GRID = "grid-cols-[40px_1fr_100px_70px_60px_70px_80px]";

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
  const [onlyOwned, setOnlyOwned] = useState(false);

  const [addingId, setAddingId] = useState<string | null>(null);
  const [addFinish, setAddFinish] = useState("");
  const [addCondition, setAddCondition] = useState("NM");
  const [addQuantity, setAddQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  const [collectionByCard, setCollectionByCard] = useState<Record<string, CollectionEntry[]>>({});
  const [collectionValue, setCollectionValue] = useState<number | null>(null);
  const [priceByKey, setPriceByKey] = useState<Map<string, number>>(new Map());

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
        setPriceByKey(priceMap);
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

  const ownedRows = useMemo(() => {
    if (!cards) return [];
    const cardsById = new Map(cards.map((c) => [c.id, c]));
    const rows: { card: CardRow; item: CollectionEntry; price: number }[] = [];
    for (const [cardId, entries] of Object.entries(collectionByCard)) {
      const card = cardsById.get(cardId);
      if (!card) continue;
      for (const item of entries) {
        const price = priceByKey.get(`${cardId}|${item.finish}`) ?? 0;
        rows.push({ card, item, price });
      }
    }
    return rows.sort((a, b) => b.price * b.item.quantity - a.price * a.item.quantity);
  }, [cards, collectionByCard, priceByKey]);

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
        <div className="flex items-center gap-2.5">
          {setInfo && (
            <svg
              viewBox={setInfo.viewBox}
              className="h-6 w-6 flex-shrink-0 fill-zinc-400"
              dangerouslySetInnerHTML={{ __html: setInfo.pathsHtml }}
            />
          )}
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            {setInfo ? setInfo.n : code.toUpperCase()}
          </h1>
          <span className="font-mono text-[11px] text-zinc-600">{code.toUpperCase()}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {setInfo && <>{setInfo.q} cards · Released {setInfo.d} · </>}
          <span className="font-mono text-emerald-400">
            {collectionValue === null ? "Loading…" : `$${collectionValue.toFixed(2)}`}
          </span>{" "}
          collected
        </p>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-4 inline-flex rounded-lg border border-zinc-800 p-0.5 text-[12.5px]">
          <button
            onClick={() => setOnlyOwned(false)}
            className={`rounded-md px-3 py-1 font-medium ${
              !onlyOwned ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All cards
          </button>
          <button
            onClick={() => setOnlyOwned(true)}
            className={`rounded-md px-3 py-1 font-medium ${
              onlyOwned ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Only mine
          </button>
        </div>

        {!onlyOwned && (
        <div
          className={`mt-4 grid ${ROW_GRID} items-center gap-2 border-b border-zinc-700 px-1 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500`}
        >
          <button onClick={() => toggleSort("collector_number")} className="text-left hover:text-zinc-200">
            № <span className="text-[10px] opacity-70">{sortArrow("collector_number")}</span>
          </button>
          <button onClick={() => toggleSort("name")} className="text-left hover:text-zinc-200">
            Name <span className="text-[10px] opacity-70">{sortArrow("name")}</span>
          </button>
          <button onClick={() => toggleSort("rarity")} className="text-left hover:text-zinc-200">
            <span className="text-[10px] opacity-70">{sortArrow("rarity")}</span>
          </button>
          <div>Border</div>
          <div>Finishes</div>
          <div>Promo</div>
          <div></div>
        </div>
        )}

        {!onlyOwned && (
        <div>
          {sorted.map((c) => (
            <Fragment key={c.id}>
              <div className={`grid ${ROW_GRID} items-center gap-2 border-b border-zinc-800 px-1 py-2.5`}>
                <div className="font-mono text-[13px] tabular-nums text-zinc-500">{c.collector_number}</div>
                <div className="truncate text-[13.5px] font-medium text-zinc-100">{c.name}</div>
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
                <div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      BORDER_STYLE[borderLabel(c)] ?? BORDER_STYLE.Regular
                    }`}
                  >
                    {borderLabel(c)}
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
          ))}
          {cards && sorted.length === 0 && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">No cards found</div>
          )}
        </div>
        )}

        {onlyOwned && (
          <>
            <div
              className={`mt-4 grid ${OWNED_GRID} items-center gap-2 border-b border-zinc-700 px-1 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500`}
            >
              <div>№</div>
              <div>Name</div>
              <div>Finish</div>
              <div>Condition</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Cost</div>
              <div className="text-right">Value</div>
            </div>

            <div>
              {ownedRows.map(({ card, item, price }) => (
                <div
                  key={item.id}
                  className={`grid ${OWNED_GRID} items-center gap-2 border-b border-zinc-800 px-1 py-2.5`}
                >
                  <div className="font-mono text-[13px] tabular-nums text-zinc-500">{card.collector_number}</div>
                  <div className="truncate text-[13.5px] font-medium text-zinc-100">{card.name}</div>
                  <div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${finishStyle[item.finish] ?? finishStyle.nonfoil}`}
                    >
                      {finishLabel[item.finish] ?? item.finish}
                    </span>
                  </div>
                  <div>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                      {item.condition}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => changeQuantity(card.id, item, -1)}
                      className="flex h-5 w-5 items-center justify-center rounded border border-zinc-700 text-[11px] leading-none text-zinc-400 hover:border-red-500 hover:text-red-400"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-mono text-[13px] text-zinc-300">{item.quantity}</span>
                    <button
                      onClick={() => changeQuantity(card.id, item, 1)}
                      className="flex h-5 w-5 items-center justify-center rounded border border-zinc-700 text-[11px] leading-none text-zinc-400 hover:border-emerald-500 hover:text-emerald-400"
                    >
                      +
                    </button>
                  </div>
                  <div
                    className={`text-right font-mono text-[13px] tabular-nums ${
                      price ? "text-zinc-300" : "text-zinc-700"
                    }`}
                  >
                    ${price.toFixed(2)}
                  </div>
                  <div
                    className={`text-right font-mono text-[13px] tabular-nums ${
                      price ? "text-emerald-400" : "text-zinc-700"
                    }`}
                  >
                    ${(price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
              {ownedRows.length === 0 && (
                <div className="px-1 py-10 text-center text-sm text-zinc-500">
                  You don&apos;t own any cards from this set yet
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
