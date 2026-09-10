"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import setsData from "@/data/sets.json";
import { parseSet, type RawSet, type ParsedSet } from "@/lib/setIcon";
import { supabase } from "@/lib/supabaseClient";
import { HistoryChart } from "@/components/HistoryChart";

const CURRENT_YEAR = new Date().getFullYear();
const SEALED_YEARS = Array.from({ length: CURRENT_YEAR - 2014 }, (_, i) => 2015 + i); // 2015..current

const PRODUCT_TYPES = [
  "Booster Box",
  "Booster Pack",
  "Draft Booster",
  "Set Booster",
  "Collector Booster",
  "Bundle",
  "Commander Deck",
  "Duel Deck",
  "Tournament Pack",
  "Prerelease Kit",
  "Buy-a-Box Promo",
  "Treasure Chest",
  "Other",
];

const LANGUAGES = ["ENG", "RUS", "FRA", "ITA", "GER", "JPN", "Other"];

type SealedItem = {
  id: string;
  quantity: number;
  note: string | null;
  created_at: string;
  sealed_products: { id: string; set_code: string; product_type: string; language: string } | null;
};

export default function StoragePage() {
  const sets = useMemo(() => (setsData as RawSet[]).map(parseSet), []);
  const parentSets = useMemo(
    () => sets.filter((s) => !s.i).sort((a, b) => a.n.localeCompare(b.n)),
    [sets]
  );
  const byCode = useMemo(() => {
    const map = new Map<string, ParsedSet>();
    for (const s of sets) map.set(s.c.toLowerCase(), s);
    return map;
  }, [sets]);

  const [items, setItems] = useState<SealedItem[] | null>(null);
  const [priceByProduct, setPriceByProduct] = useState<Map<string, number>>(new Map());
  const [historyByProduct, setHistoryByProduct] = useState<Map<string, Record<number, number>>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [newYear, setNewYear] = useState(CURRENT_YEAR);
  const [newPrice, setNewPrice] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  const [setCode, setSetCode] = useState(() => parentSets[0]?.c ?? "");
  const [productType, setProductType] = useState(PRODUCT_TYPES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchStorageData(): Promise<
    | {
        items: SealedItem[];
        priceByProduct: Map<string, number>;
        historyByProduct: Map<string, Record<number, number>>;
      }
    | { error: string }
  > {
    const { data, error } = await supabase
      .from("sealed_items")
      .select("id,quantity,note,created_at,sealed_products(id,set_code,product_type,language)")
      .order("created_at", { ascending: false });
    if (error) return { error: error.message };
    const rows = (data ?? []) as unknown as SealedItem[];

    const productIds = [...new Set(rows.map((r) => r.sealed_products?.id).filter(Boolean))] as string[];
    const priceMap = new Map<string, number>();
    const historyMap = new Map<string, Record<number, number>>();
    if (productIds.length) {
      const { data: prices } = await supabase
        .from("sealed_price_history")
        .select("product_id,year,price_usd")
        .in("product_id", productIds)
        .order("year", { ascending: false });
      for (const p of prices ?? []) {
        if (!historyMap.has(p.product_id)) historyMap.set(p.product_id, {});
        historyMap.get(p.product_id)![p.year] = p.price_usd;
        // Most recent year per product wins (rows already ordered newest-first).
        if (!priceMap.has(p.product_id)) priceMap.set(p.product_id, p.price_usd);
      }
    }
    return { items: rows, priceByProduct: priceMap, historyByProduct: historyMap };
  }

  const applyStorageData = useCallback(
    (result: Awaited<ReturnType<typeof fetchStorageData>>) => {
      if ("error" in result) {
        setLoadError(result.error);
        return;
      }
      setItems(result.items);
      setPriceByProduct(result.priceByProduct);
      setHistoryByProduct(result.historyByProduct);
    },
    []
  );

  useEffect(() => {
    fetchStorageData().then((result) => applyStorageData(result));
  }, [applyStorageData]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!setCode) return;
    setSaving(true);
    setLoadError(null);
    try {
      const { data: product, error: upsertError } = await supabase
        .from("sealed_products")
        .upsert(
          { set_code: setCode.toLowerCase(), product_type: productType, language },
          { onConflict: "set_code,product_type,language" }
        )
        .select("id")
        .single();
      if (upsertError || !product) throw upsertError ?? new Error("Upsert failed");

      const { error: insertError } = await supabase
        .from("sealed_items")
        .insert({ product_id: product.id, quantity, note: note || null });
      if (insertError) throw insertError;

      setNote("");
      setQuantity(1);
      applyStorageData(await fetchStorageData());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPrice(productId: string) {
    const price = parseFloat(newPrice.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) return;
    setSavingPrice(true);
    setLoadError(null);
    try {
      const { error } = await supabase
        .from("sealed_price_history")
        .upsert({ product_id: productId, year: newYear, price_usd: price }, { onConflict: "product_id,year" });
      if (error) throw error;
      setNewPrice("");
      applyStorageData(await fetchStorageData());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save price");
    } finally {
      setSavingPrice(false);
    }
  }

  const boosterTotal =
    items?.reduce((sum, i) => (i.sealed_products?.product_type === "Booster Pack" ? sum + i.quantity : sum), 0) ?? 0;
  const boxesTotal =
    items?.reduce((sum, i) => (i.sealed_products?.product_type === "Booster Box" ? sum + i.quantity : sum), 0) ?? 0;
  const totalValue =
    items?.reduce((sum, i) => {
      const price = i.sealed_products ? priceByProduct.get(i.sealed_products.id) ?? 0 : 0;
      return sum + price * i.quantity;
    }, 0) ?? 0;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-5xl">
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-zinc-800 sm:grid-cols-3">
          <div className="border-l border-zinc-800 p-4 first:border-l-0">
            <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
              ${totalValue.toFixed(2)}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">Storage value</div>
          </div>
          <div className="border-l border-zinc-800 p-4">
            <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">{boosterTotal}</div>
            <div className="mt-0.5 text-xs text-zinc-500">Booster total</div>
          </div>
          <div className="border-l border-zinc-800 p-4">
            <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">{boxesTotal}</div>
            <div className="mt-0.5 text-xs text-zinc-500">Boxes total</div>
          </div>
        </div>

        <form
          onSubmit={handleAdd}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4"
        >
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Set</label>
            <select
              value={setCode}
              onChange={(e) => setSetCode(e.target.value)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
            >
              {parentSets.map((s) => (
                <option key={s.c} value={s.c}>
                  {s.n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Product</label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Qty</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-16 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
            />
          </div>

          <div className="flex flex-1 min-w-[160px] flex-col gap-1">
            <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. bought at prerelease"
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !setCode}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </form>

        {loadError && <p className="mt-3 text-sm text-red-400">{loadError}</p>}

        <div className="mt-8 grid grid-cols-[1fr_70px_80px_90px_1fr_70px] items-center gap-2 border-b border-zinc-700 px-1 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <div>Product</div>
          <div className="text-right">Qty</div>
          <div className="text-right">Price</div>
          <div className="text-right">Value</div>
          <div>Note</div>
          <div className="text-right">History</div>
        </div>

        <div>
          {items?.map((item) => {
            const product = item.sealed_products;
            const set = product ? byCode.get(product.set_code.toLowerCase()) : undefined;
            const price = product ? priceByProduct.get(product.id) ?? 0 : 0;
            const history = product ? historyByProduct.get(product.id) : undefined;
            const isOpen = openHistory === item.id;
            return (
              <Fragment key={item.id}>
              <div
                className="grid grid-cols-[1fr_70px_80px_90px_1fr_70px] items-center gap-2 border-b border-zinc-800 px-1 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {set && (
                    <svg
                      viewBox={set.viewBox}
                      className="h-4 w-4 flex-shrink-0 fill-zinc-500 opacity-90"
                      dangerouslySetInnerHTML={{ __html: set.pathsHtml }}
                    />
                  )}
                  <span className="truncate text-[13.5px] font-medium text-zinc-100">
                    {set?.n ?? product?.set_code}
                  </span>
                  <span className="flex-shrink-0 text-[12px] text-zinc-500">{product?.product_type}</span>
                  {product?.language && product.language !== "ENG" && (
                    <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-wide text-zinc-600">
                      {product.language}
                    </span>
                  )}
                </div>
                <div className="text-right font-mono text-[13px] tabular-nums text-zinc-100">{item.quantity}</div>
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
                <div className="truncate text-[12.5px] text-zinc-500">{item.note}</div>
                <div className="text-right">
                  <button
                    onClick={() => {
                      setOpenHistory((cur) => (cur === item.id ? null : item.id));
                      setNewPrice("");
                      setNewYear(CURRENT_YEAR);
                    }}
                    className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-indigo-400 hover:text-indigo-400"
                  >
                    {isOpen ? "Hide" : "History"}
                  </button>
                </div>
              </div>
              {isOpen && product && (
                <div className="border-b border-zinc-800 bg-zinc-950/60 px-1 py-4">
                  {history ? (
                    <HistoryChart series={[{ label: "Price", color: "#818cf8", byYear: history }]} years={SEALED_YEARS} />
                  ) : (
                    <p className="text-sm text-zinc-500">No price history yet for this product.</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">Year</label>
                      <input
                        type="number"
                        min={2015}
                        max={CURRENT_YEAR + 1}
                        value={newYear}
                        onChange={(e) => setNewYear(parseInt(e.target.value, 10) || CURRENT_YEAR)}
                        className="w-20 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                        Price (USD)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-24 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
                      />
                    </div>
                    <button
                      onClick={() => handleAddPrice(product.id)}
                      disabled={savingPrice || !newPrice}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {savingPrice ? "Saving…" : "Save price"}
                    </button>
                  </div>
                </div>
              )}
              </Fragment>
            );
          })}
          {items && items.length === 0 && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">
              Nothing in storage yet — add your first sealed item above.
            </div>
          )}
          {items === null && !loadError && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}
