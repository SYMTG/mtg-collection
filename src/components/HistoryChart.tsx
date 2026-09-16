type Series = { label: string; color: string; byYear: Record<number, number> };

export function HistoryChart({
  series,
  years,
}: {
  series: Series[];
  years: number[];
}) {
  const width = 480;
  const height = 160;
  const padding = 28;

  const allValues = series.flatMap((s) => years.map((y) => s.byYear[y] ?? 0));
  const max = Math.max(...allValues, 0.01);

  const seriesPoints = series.map((s) => ({
    ...s,
    points: years.map((year, i) => {
      const x = padding + (i / (years.length - 1)) * (width - padding * 2);
      const value = s.byYear[year] ?? 0;
      const y = height - padding - (value / max) * (height - padding * 2);
      return { x, y, year, value, hasValue: year in s.byYear };
    }),
  }));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="max-w-full">
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        className="stroke-zinc-300 dark:stroke-zinc-700"
      />
      {seriesPoints.map((s) => {
        const present = s.points.filter((p) => p.hasValue);
        const path = present.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
        return (
          <g key={s.label}>
            <path d={path} fill="none" stroke={s.color} strokeWidth={2} />
            {present.map((p) => (
              <g key={p.year}>
                <circle cx={p.x} cy={p.y} r={2.5} fill={s.color} />
                <title>
                  {s.label} {p.year}: ${p.value.toFixed(2)}
                </title>
              </g>
            ))}
          </g>
        );
      })}
      {years.map((year, i) => {
        if (!(year % 2 === 1 || year === years[years.length - 1])) return null;
        const x = padding + (i / (years.length - 1)) * (width - padding * 2);
        return (
          <text
            key={year}
            x={x}
            y={height - padding + 14}
            textAnchor="middle"
            className="fill-zinc-400 text-[9px] dark:fill-zinc-500"
          >
            {year}
          </text>
        );
      })}
    </svg>
  );
}
