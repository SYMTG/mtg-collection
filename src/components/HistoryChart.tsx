export function HistoryChart({ byYear, years }: { byYear: Record<number, number>; years: number[] }) {
  const width = 480;
  const height = 160;
  const padding = 28;

  const values = years.map((y) => byYear[y] ?? 0);
  const max = Math.max(...values, 0.01);

  const points = years.map((year, i) => {
    const x = padding + (i / (years.length - 1)) * (width - padding * 2);
    const y = height - padding - (values[i] / max) * (height - padding * 2);
    return { x, y, year, value: values[i] };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <svg width={width} height={height} className="max-w-full">
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        className="stroke-zinc-300 dark:stroke-zinc-700"
      />
      <path d={path} fill="none" className="stroke-indigo-500" strokeWidth={2} />
      {points.map((p) => (
        <g key={p.year}>
          <circle cx={p.x} cy={p.y} r={2.5} className="fill-indigo-500" />
          {(p.year % 2 === 1 || p.year === years[years.length - 1]) && (
            <text
              x={p.x}
              y={height - padding + 14}
              textAnchor="middle"
              className="fill-zinc-400 text-[9px] dark:fill-zinc-500"
            >
              {p.year}
            </text>
          )}
          <title>
            {p.year}: ${p.value.toFixed(2)}
          </title>
        </g>
      ))}
    </svg>
  );
}
