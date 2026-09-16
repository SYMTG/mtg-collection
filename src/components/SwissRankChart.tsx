type RankItem = { label: string; sublabel?: string; value: number };

export function SwissRankChart({
  title,
  items,
  unit = "",
  decimals = 2,
}: {
  title: string;
  items: RankItem[];
  unit?: string;
  decimals?: number;
}) {
  function fmt(v: number) {
    return `${unit}${v.toFixed(decimals)}`;
  }

  const maxValue = Math.max(...items.map((i) => i.value), 0.01);

  return (
    <div>
      <p className="mb-3 font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
        {title} — top {items.length}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No data yet.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-10">
          <div className="flex min-w-0 flex-1 items-end gap-2">
            {items.map((item, i) => {
              const barHeight = Math.max((item.value / maxValue) * 90, 3);
              return (
                <div
                  key={`${item.label}-${i}`}
                  className="flex flex-1 flex-col items-center gap-1.5"
                  title={item.sublabel ?? item.label}
                >
                  <span className="font-mono text-[10px] tabular-nums text-zinc-400">{fmt(item.value)}</span>
                  <div className={`w-full ${i === 0 ? "bg-[#cf2b1f]" : "bg-zinc-600"}`} style={{ height: barHeight }} />
                  <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">{item.label}</span>
                </div>
              );
            })}
          </div>

          <div className="flex-shrink-0 sm:w-56">
            <div className="font-sans text-[38px] font-black leading-none tracking-tight text-zinc-100">
              {fmt(items[0].value)}
            </div>
            <p className="mt-2 text-[12.5px] leading-snug text-zinc-500">
              Highest — {items[0].sublabel ?? items[0].label}. Top {items.length} total: {fmt(items.reduce((sum, i) => sum + i.value, 0))}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
