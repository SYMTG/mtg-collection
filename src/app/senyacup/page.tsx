import Link from "next/link";

const BUCKET = "https://lkofssshjodesmtqoimo.supabase.co/storage/v1/object/public/senyacup";

type Stage = {
  n: number;
  label: string;
  detail: string;
  file: string;
  itemFile?: string;
};

const BRUTE_7_STAGES: Stage[] = [
  { n: 0, label: "Base", detail: "Formation", file: "e0.png" },
  { n: 1, label: "Crusher Arm", detail: "Grade A-", file: "e1.png", itemFile: "item-e1.png" },
  { n: 2, label: "Bastion Breaker Plating", detail: "Grade A-", file: "e2.png", itemFile: "item-e2.png" },
  { n: 3, label: "Overdrive Coupling", detail: "Grade A+", file: "e3.png", itemFile: "item-e3.png" },
  { n: 4, label: "Venting Yoke", detail: "Grade B+", file: "e4.png", itemFile: "item-e4.png" },
  { n: 5, label: "Second Sun", detail: "Grade S", file: "e5.png", itemFile: "item-e5.png" },
  { n: 6, label: "Pulse Governor", detail: "Grade A-", file: "e6.png", itemFile: "item-e6.png" },
];

export default function SenyacupPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-5xl">
        <Link href="/" className="text-xs text-zinc-500 hover:text-indigo-400">
          ← Back to projects
        </Link>

        <div className="mt-3 flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Brute-7</h1>
          <span className="font-mono text-[11px] text-zinc-600">7-stage equipment evolution</span>
        </div>

        <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
          {BRUTE_7_STAGES.map((s) => (
            <div key={s.n} className="flex w-64 flex-shrink-0 flex-col">
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${BUCKET}/brute-7/${s.file}`}
                  alt={`Brute-7 — stage ${s.n}: ${s.label}`}
                  loading="eager"
                  className="h-full w-full object-cover"
                />
                {s.itemFile && (
                  <a
                    href={`${BUCKET}/brute-7/${s.itemFile}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${s.label} reference, full size`}
                    className="absolute bottom-2 right-2 h-14 w-14 overflow-hidden rounded-md border-2 border-zinc-950 shadow-lg ring-1 ring-zinc-700 transition hover:scale-105 hover:ring-indigo-400"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${BUCKET}/brute-7/${s.itemFile}`}
                      alt={`${s.label} — equipment reference`}
                      loading="eager"
                      className="h-full w-full object-cover"
                    />
                  </a>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-zinc-600">{String(s.n).padStart(2, "0")}</span>
                <span className="truncate text-[13px] font-medium text-zinc-200">{s.label}</span>
              </div>
              <span className="text-[11px] text-zinc-500">{s.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
