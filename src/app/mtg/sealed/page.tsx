"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import setsData from "@/data/sets.json";
import { parseSet, type RawSet, type ParsedSet } from "@/lib/setIcon";
import { supabase } from "@/lib/supabaseClient";
import { SwissTrendChart } from "@/components/SwissTrendChart";
import { SwissRankChart } from "@/components/SwissRankChart";

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

type CardmarketLatest = {
  availableItems: number | null;
  priceFrom: number | null;
  productUrl: string | null;
  snapshotMonth: string | null;
};

type CardmarketSeries = {
  months: string[];
  qty: Record<string, number>;
  from: Record<string, number>;
};

type PortfolioSeries = {
  months: string[];
  byMonth: Record<string, number>;
};

function topByValue(
  items: SealedItem[] | null,
  cmLatestByProduct: Map<string, CardmarketLatest>,
  productType: string,
  byCode: Map<string, ParsedSet>
) {
  if (!items) return [];
  return items
    .filter((i) => i.sealed_products?.product_type === productType)
    .map((i) => {
      const product = i.sealed_products!;
      const priceFrom = cmLatestByProduct.get(product.id)?.priceFrom;
      if (priceFrom == null) return null;
      const set = byCode.get(product.set_code.toLowerCase());
      return {
        label: product.set_code.toUpperCase(),
        sublabel: `${set?.n ?? product.set_code} — ${product.language}`,
        value: priceFrom * i.quantity,
      };
    })
    .filter((x): x is { label: string; sublabel: string; value: number } => x != null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

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
  const [cmLatestByProduct, setCmLatestByProduct] = useState<Map<string, CardmarketLatest>>(new Map());
  const [cmSeriesByProduct, setCmSeriesByProduct] = useState<Map<string, CardmarketSeries>>(new Map());
  const [loadingSeries, setLoadingSeries] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const [openReport, setOpenReport] = useState<"history" | "topBoosters" | "topBoxes" | null>(null);
  const [portfolioSeries, setPortfolioSeries] = useState<PortfolioSeries | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    setCode: string;
    language: string;
    quantity: number;
    note: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [setCode, setSetCode] = useState(() => parentSets[0]?.c ?? "");
  const [productType, setProductType] = useState(PRODUCT_TYPES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchStorageData(): Promise<
    | {
        items: SealedItem[];
        cmLatestByProduct: Map<string, CardmarketLatest>;
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
    const cmLatestByProduct = new Map<string, CardmarketLatest>();
    if (productIds.length) {
      // Reads a view (DISTINCT ON product_id, latest snapshot_month) instead
      // of the raw table — bounded by product count, not by how many months
      // of history have piled up, so it never hits Supabase's row cap.
      const { data: cmRows } = await supabase
        .from("cardmarket_price_snapshots_latest")
        .select("product_id,available_items,price_from,product_url,snapshot_month")
        .in("product_id", productIds);
      for (const row of cmRows ?? []) {
        cmLatestByProduct.set(row.product_id as string, {
          availableItems: row.available_items,
          priceFrom: row.price_from,
          productUrl: row.product_url,
          snapshotMonth: row.snapshot_month ? (row.snapshot_month as string).slice(0, 7) : null,
        });
      }
    }
    return { items: rows, cmLatestByProduct };
  }

  const applyStorageData = useCallback(
    (result: Awaited<ReturnType<typeof fetchStorageData>>) => {
      if ("error" in result) {
        setLoadError(result.error);
        return;
      }
      setItems(result.items);
      setCmLatestByProduct(result.cmLatestByProduct);
    },
    []
  );

  // Fetches one product's full monthly history on first expand, instead of
  // prefetching every product's entire history on every page load.
  async function loadSeriesFor(productId: string) {
    if (cmSeriesByProduct.has(productId) || loadingSeries.has(productId)) return;
    setLoadingSeries((prev) => new Set(prev).add(productId));
    const { data } = await supabase
      .from("cardmarket_price_snapshots")
      .select("available_items,price_from,snapshot_month")
      .eq("product_id", productId)
      .order("snapshot_month", { ascending: true });

    const series: CardmarketSeries = { months: [], qty: {}, from: {} };
    for (const row of data ?? []) {
      const month = (row.snapshot_month as string).slice(0, 7); // "YYYY-MM"
      series.months.push(month);
      if (row.available_items != null) series.qty[month] = row.available_items;
      if (row.price_from != null) series.from[month] = row.price_from;
    }

    setCmSeriesByProduct((prev) => new Map(prev).set(productId, series));
    setLoadingSeries((prev) => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  }

  // Whole-collection value per month: for each product, carries its last
  // known price forward into months it wasn't re-checked (a box doesn't
  // become worthless between snapshots), multiplies by that product's
  // current quantity, and sums across every product. Fetched once, lazily,
  // on first click of the History button — not on every page load.
  async function loadPortfolioHistory() {
    if (portfolioSeries || loadingPortfolio || !items) return;
    setLoadingPortfolio(true);

    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
      if (!item.sealed_products) continue;
      const pid = item.sealed_products.id;
      qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + item.quantity);
    }
    const productIds = [...qtyByProduct.keys()];
    if (productIds.length === 0) {
      setPortfolioSeries({ months: [], byMonth: {} });
      setLoadingPortfolio(false);
      return;
    }

    const { data } = await supabase
      .from("cardmarket_price_snapshots")
      .select("product_id,price_from,snapshot_month")
      .in("product_id", productIds)
      .order("snapshot_month", { ascending: true });

    const priceByProductMonth = new Map<string, Map<string, number>>();
    const allMonthsSet = new Set<string>();
    for (const row of data ?? []) {
      if (row.price_from == null) continue;
      const month = (row.snapshot_month as string).slice(0, 7);
      allMonthsSet.add(month);
      const pid = row.product_id as string;
      if (!priceByProductMonth.has(pid)) priceByProductMonth.set(pid, new Map());
      priceByProductMonth.get(pid)!.set(month, row.price_from as number);
    }

    const allMonths = [...allMonthsSet].sort();
    const lastKnown = new Map<string, number>();
    const byMonth: Record<string, number> = {};
    for (const month of allMonths) {
      for (const [pid, series] of priceByProductMonth) {
        if (series.has(month)) lastKnown.set(pid, series.get(month)!);
      }
      let total = 0;
      for (const [pid, qty] of qtyByProduct) {
        const price = lastKnown.get(pid);
        if (price != null) total += price * qty;
      }
      byMonth[month] = total;
    }

    setPortfolioSeries({ months: allMonths.slice(-12), byMonth });
    setLoadingPortfolio(false);
  }

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

  function startEdit(item: SealedItem) {
    setEditingId(item.id);
    setEditError(null);
    setEditDraft({
      setCode: item.sealed_products?.set_code ?? "",
      language: item.sealed_products?.language ?? LANGUAGES[0],
      quantity: item.quantity,
      note: item.note ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  }

  async function handleSaveEdit(item: SealedItem) {
    if (!editDraft || !editDraft.setCode.trim()) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const { data: product, error: upsertError } = await supabase
        .from("sealed_products")
        .upsert(
          {
            set_code: editDraft.setCode.toLowerCase().trim(),
            product_type: item.sealed_products?.product_type ?? PRODUCT_TYPES[0],
            language: editDraft.language,
          },
          { onConflict: "set_code,product_type,language" }
        )
        .select("id")
        .single();
      if (upsertError || !product) throw upsertError ?? new Error("Upsert failed");

      const { error: updateError } = await supabase
        .from("sealed_items")
        .update({ product_id: product.id, quantity: editDraft.quantity, note: editDraft.note || null })
        .eq("id", item.id);
      if (updateError) throw updateError;

      cancelEdit();
      applyStorageData(await fetchStorageData());
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  }

  const currentMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [search, setSearch] = useState("");
  const [onlyOutdated, setOnlyOutdated] = useState(false);

  // Filtered by name/code search and the "only outdated" toggle, then
  // processed (has a Link, i.e. at least one live snapshot) first, then by
  // Value descending within each group.
  const sortedItems = useMemo(() => {
    if (!items) return null;
    const q = search.trim().toLowerCase();

    const filtered = items.filter((item) => {
      const product = item.sealed_products;
      if (!product) return false;

      if (onlyOutdated) {
        const cm = cmLatestByProduct.get(product.id);
        if (cm?.snapshotMonth === currentMonth) return false;
      }

      if (q) {
        const set = byCode.get(product.set_code.toLowerCase());
        const haystack = `${set?.n ?? ""} ${product.set_code} ${product.product_type}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const aCm = a.sealed_products ? cmLatestByProduct.get(a.sealed_products.id) : undefined;
      const bCm = b.sealed_products ? cmLatestByProduct.get(b.sealed_products.id) : undefined;
      const aHasLink = aCm?.productUrl != null;
      const bHasLink = bCm?.productUrl != null;
      if (aHasLink !== bHasLink) return aHasLink ? -1 : 1;

      const aValue = aCm?.priceFrom != null ? aCm.priceFrom * a.quantity : -Infinity;
      const bValue = bCm?.priceFrom != null ? bCm.priceFrom * b.quantity : -Infinity;
      return bValue - aValue;
    });
  }, [items, cmLatestByProduct, search, onlyOutdated, currentMonth, byCode]);

  const topBoosters = useMemo(
    () => topByValue(items, cmLatestByProduct, "Booster Pack", byCode),
    [items, cmLatestByProduct, byCode]
  );
  const topBoxes = useMemo(
    () => topByValue(items, cmLatestByProduct, "Booster Box", byCode),
    [items, cmLatestByProduct, byCode]
  );

  const boosterTotal =
    items?.reduce((sum, i) => (i.sealed_products?.product_type === "Booster Pack" ? sum + i.quantity : sum), 0) ?? 0;
  const boxesTotal =
    items?.reduce((sum, i) => (i.sealed_products?.product_type === "Booster Box" ? sum + i.quantity : sum), 0) ?? 0;
  const totalValue =
    items?.reduce((sum, i) => {
      const cmMin = i.sealed_products ? cmLatestByProduct.get(i.sealed_products.id)?.priceFrom : null;
      return sum + (cmMin != null ? cmMin * i.quantity : 0);
    }, 0) ?? 0;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-5xl">
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-zinc-800 sm:grid-cols-3">
          <div className="border-l border-zinc-800 p-4 first:border-l-0">
            <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
              €{totalValue.toFixed(0)}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">Storage value (Cardmarket)</div>
            <button
              onClick={() => {
                setOpenReport((cur) => (cur === "history" ? null : "history"));
                loadPortfolioHistory();
              }}
              className={`mt-2 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                openReport === "history"
                  ? "border-indigo-400 bg-indigo-950/60 text-indigo-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
              }`}
            >
              History
            </button>
          </div>
          <div className="border-l border-zinc-800 p-4">
            <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">{boosterTotal}</div>
            <div className="mt-0.5 text-xs text-zinc-500">Booster total</div>
            <button
              onClick={() => setOpenReport((cur) => (cur === "topBoosters" ? null : "topBoosters"))}
              className={`mt-2 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                openReport === "topBoosters"
                  ? "border-indigo-400 bg-indigo-950/60 text-indigo-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
              }`}
            >
              Top-10
            </button>
          </div>
          <div className="border-l border-zinc-800 p-4">
            <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">{boxesTotal}</div>
            <div className="mt-0.5 text-xs text-zinc-500">Boxes total</div>
            <button
              onClick={() => setOpenReport((cur) => (cur === "topBoxes" ? null : "topBoxes"))}
              className={`mt-2 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                openReport === "topBoxes"
                  ? "border-indigo-400 bg-indigo-950/60 text-indigo-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
              }`}
            >
              Top-10
            </button>
          </div>
        </div>

        {openReport && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            {openReport === "history" &&
              (loadingPortfolio ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : portfolioSeries && portfolioSeries.months.length > 0 ? (
                <SwissTrendChart
                  label="Storage value"
                  months={portfolioSeries.months}
                  byMonth={portfolioSeries.byMonth}
                  unit="€"
                  decimals={0}
                  captionKind="directional-duration"
                  subject="Storage value"
                />
              ) : (
                <p className="text-sm text-zinc-500">No snapshot history yet.</p>
              ))}
            {openReport === "topBoosters" && (
              <SwissRankChart title="Booster Pack value" items={topBoosters} unit="€" decimals={0} />
            )}
            {openReport === "topBoxes" && (
              <SwissRankChart title="Booster Box value" items={topBoxes} unit="€" decimals={0} />
            )}
          </div>
        )}

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

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="w-64 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
          />
          <button
            onClick={() => setOnlyOutdated((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium ${
              onlyOutdated
                ? "border-indigo-400 bg-indigo-950/60 text-indigo-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Only outdated
          </button>
          {(search || onlyOutdated) && (
            <span className="text-[12px] text-zinc-500">
              {sortedItems?.length ?? 0} of {items?.length ?? 0}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-[20px_1fr_55px_50px_60px_75px_85px_172px] items-center gap-2 border-b border-zinc-700 px-1 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <div />
          <div>Product</div>
          <div>Code</div>
          <div className="text-right">Qty</div>
          <div className="text-right">CM Qty</div>
          <div className="text-right">CM Min</div>
          <div className="text-right">Value</div>
          <div className="text-right">Actions</div>
        </div>

        <div>
          {sortedItems?.map((item) => {
            const product = item.sealed_products;
            const set = product ? byCode.get(product.set_code.toLowerCase()) : undefined;
            const cm = product ? cmLatestByProduct.get(product.id) : undefined;
            const series = product ? cmSeriesByProduct.get(product.id) : undefined;
            const isLoadingSeries = product ? loadingSeries.has(product.id) : false;
            const value = cm?.priceFrom != null ? cm.priceFrom * item.quantity : null;
            const isOpen = openHistory === item.id;
            const isEditing = editingId === item.id;
            return (
              <Fragment key={item.id}>
              <div
                className="grid grid-cols-[20px_1fr_55px_50px_60px_75px_85px_172px] items-center gap-2 border-b border-zinc-800 px-1 py-3"
              >
                <div className="flex items-center justify-center">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      cm?.snapshotMonth === currentMonth ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                    title={cm?.snapshotMonth === currentMonth ? "Updated this month" : "No update this month"}
                  />
                </div>
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
                </div>
                <div className="font-mono text-[12px] uppercase tracking-wide text-zinc-500">
                  {product?.set_code ?? "—"}
                </div>
                <div className="text-right font-mono text-[13px] tabular-nums text-zinc-100">{item.quantity}</div>
                <div
                  className={`text-right font-mono text-[13px] tabular-nums ${
                    cm?.availableItems != null ? "text-zinc-300" : "text-zinc-700"
                  }`}
                >
                  {cm?.availableItems ?? "—"}
                </div>
                <div
                  className={`text-right font-mono text-[13px] tabular-nums ${
                    cm?.priceFrom != null ? "text-zinc-300" : "text-zinc-700"
                  }`}
                >
                  {cm?.priceFrom != null ? `€${cm.priceFrom.toFixed(2)}` : "—"}
                </div>
                <div
                  className={`text-right font-mono text-[13px] tabular-nums ${
                    value != null ? "text-emerald-400" : "text-zinc-700"
                  }`}
                >
                  {value != null ? `€${value.toFixed(2)}` : "—"}
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  {product?.language && (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                      {product.language}
                    </span>
                  )}
                  {cm?.productUrl && (
                    <a
                      href={cm.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-indigo-400 hover:text-indigo-400"
                    >
                      Link
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setOpenHistory((cur) => (cur === item.id ? null : item.id));
                      if (product) loadSeriesFor(product.id);
                    }}
                    className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-indigo-400 hover:text-indigo-400"
                  >
                    {isOpen ? "Hide" : "History"}
                  </button>
                  <button
                    onClick={() => (isEditing ? cancelEdit() : startEdit(item))}
                    className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-indigo-400 hover:text-indigo-400"
                  >
                    {isEditing ? "Cancel" : "Edit"}
                  </button>
                </div>
              </div>
              {isEditing && (
                <div className="border-b border-zinc-800 bg-zinc-950/60 px-1 py-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
                        Set code
                      </label>
                      <input
                        type="text"
                        value={editDraft?.setCode ?? ""}
                        onChange={(e) => setEditDraft((d) => (d ? { ...d, setCode: e.target.value } : d))}
                        placeholder="e.g. mmq"
                        className="w-24 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
                        Language
                      </label>
                      <select
                        value={editDraft?.language ?? LANGUAGES[0]}
                        onChange={(e) => setEditDraft((d) => (d ? { ...d, language: e.target.value } : d))}
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
                        value={editDraft?.quantity ?? 1}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : d
                          )
                        }
                        className="w-16 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className="flex flex-1 min-w-[160px] flex-col gap-1">
                      <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Note</label>
                      <input
                        type="text"
                        value={editDraft?.note ?? ""}
                        onChange={(e) => setEditDraft((d) => (d ? { ...d, note: e.target.value } : d))}
                        placeholder="optional"
                        className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
                      />
                    </div>
                    <button
                      onClick={cancelEdit}
                      className="rounded-md border border-zinc-800 px-4 py-1.5 text-[13px] font-medium text-zinc-300 hover:border-zinc-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(item)}
                      disabled={savingEdit || !editDraft?.setCode.trim()}
                      className="rounded-md bg-indigo-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {savingEdit ? "Saving…" : "Save"}
                    </button>
                  </div>
                  {editError && <p className="mt-2 text-[12.5px] text-red-400">{editError}</p>}
                </div>
              )}
              {isOpen && product && (
                <div className="border-b border-zinc-800 bg-zinc-950/60 px-1 py-4">
                  {isLoadingSeries ? (
                    <p className="text-sm text-zinc-500">Loading…</p>
                  ) : !series || series.months.length === 0 ? (
                    <p className="text-sm text-zinc-500">No snapshots yet for this product.</p>
                  ) : (
                    <div className="flex flex-col gap-6">
                      <SwissTrendChart
                        label="CM Qty"
                        months={series.months}
                        byMonth={series.qty}
                        decimals={0}
                        captionKind="duration"
                        subject="Available quantity"
                      />
                      <SwissTrendChart
                        label="CM Min"
                        months={series.months}
                        byMonth={series.from}
                        unit="€"
                        decimals={0}
                        captionKind="directional-duration"
                        subject="Price"
                      />
                    </div>
                  )}
                  {item.note && (
                    <p className="mt-3 text-[12.5px] text-zinc-500">
                      <span className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-600">Note: </span>
                      {item.note}
                    </p>
                  )}
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
          {items && items.length > 0 && sortedItems?.length === 0 && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">
              No items match the current search/filter.
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
