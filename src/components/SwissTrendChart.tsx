const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatShort(month: string) {
  const [year, mo] = month.split("-");
  return `${MONTH_SHORT[parseInt(mo, 10) - 1]} ${year.slice(2)}`;
}

function formatLong(month: string) {
  const [year, mo] = month.split("-");
  return `${MONTH_LONG[parseInt(mo, 10) - 1]} ${year}`;
}

function monthSpan(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const total = (ty - fy) * 12 + (tm - fm);
  return { years: Math.floor(total / 12), months: total % 12 };
}

export function SwissTrendChart({
  label,
  months,
  byMonth,
  unit = "",
  decimals = 0,
  captionKind = "range",
  subject,
}: {
  label: string;
  months: string[];
  byMonth: Record<string, number>;
  unit?: string;
  decimals?: number;
  captionKind?: "range" | "duration" | "directional-duration";
  subject?: string;
}) {
  const present = months.filter((m) => m in byMonth);
  const max = Math.max(...present.map((m) => byMonth[m]), 0.01);

  function fmt(v: number) {
    return `${unit}${v.toFixed(decimals)}`;
  }

  return (
    <div>
      <p className="mb-3 font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">{label} — monthly</p>
      {present.length === 0 ? (
        <p className="text-sm text-zinc-500">No data yet.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-10">
          <div className="flex min-w-0 flex-1 items-end gap-2">
            {present.map((m, i) => {
              const value = byMonth[m];
              const isLast = i === present.length - 1;
              const barHeight = Math.max((value / max) * 90, 3);
              return (
                <div key={m} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="font-mono text-[10px] tabular-nums text-zinc-400">{fmt(value)}</span>
                  <div
                    className={`w-full ${isLast ? "bg-[#cf2b1f]" : "bg-zinc-600"}`}
                    style={{ height: barHeight }}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                    {formatShort(m)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex-shrink-0 sm:w-56">
            {present.length >= 2 ? (
              (() => {
                const first = byMonth[present[0]];
                const last = byMonth[present[present.length - 1]];
                const pct = first !== 0 ? ((last - first) / first) * 100 : null;
                const { years, months: mo } = monthSpan(present[0], present[present.length - 1]);
                const span = `${years} year${years === 1 ? "" : "s"} ${mo} month${mo === 1 ? "" : "s"}`;
                const subjectText = subject ?? label;
                const direction = last > first ? "increased" : last < first ? "decreased" : "stayed flat";

                let caption;
                if (captionKind === "duration") {
                  caption = (
                    <>
                      {subjectText} changed over {span}, starting from {formatLong(present[0])}.
                    </>
                  );
                } else if (captionKind === "directional-duration") {
                  caption = (
                    <>
                      {subjectText} {direction} over {span}, starting from {formatLong(present[0])}.
                    </>
                  );
                } else {
                  caption = (
                    <>
                      {label} since {formatLong(present[0])} — {fmt(first)} &rarr; {fmt(last)}.
                    </>
                  );
                }

                return (
                  <>
                    <div className="font-sans text-[38px] font-black leading-none tracking-tight text-zinc-100">
                      {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`}
                    </div>
                    <p className="mt-2 text-[12.5px] leading-snug text-zinc-500">{caption}</p>
                  </>
                );
              })()
            ) : (
              <>
                <div className="font-sans text-[28px] font-black leading-none tracking-tight text-zinc-100">
                  {fmt(byMonth[present[0]])}
                </div>
                <p className="mt-2 text-[12.5px] leading-snug text-zinc-500">
                  First {label.toLowerCase()} reading, {formatLong(present[0])}.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
