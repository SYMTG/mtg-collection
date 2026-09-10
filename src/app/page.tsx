import Link from "next/link";
import WorkScheduleCalendar from "@/components/WorkScheduleCalendar";

type Project = {
  href: string;
  name: string;
  code: string;
  description: string;
  live: boolean;
  accent: string;
};

const PROJECTS: Project[] = [
  {
    href: "/mtg",
    name: "MTG Collection",
    code: "MTG",
    description: "Personal Magic: The Gathering collection — sets, prices, sealed inventory.",
    live: true,
    accent: "text-indigo-400 bg-indigo-950/60",
  },
  {
    href: "/senyacup",
    name: "Senyacup",
    code: "SC",
    description: "Game design project — equipment, characters, world.",
    live: true,
    accent: "text-fuchsia-400 bg-fuchsia-950/40",
  },
  {
    href: "/czn",
    name: "CZN",
    code: "CZN",
    description: "Data and lore reference for a gacha game roster.",
    live: false,
    accent: "text-rose-400 bg-rose-950/40",
  },
  {
    href: "/budget",
    name: "Budget",
    code: "B",
    description: "Personal monthly budget tracking.",
    live: false,
    accent: "text-emerald-400 bg-emerald-950/40",
  },
  {
    href: "/local-llm",
    name: "Local LLM",
    code: "LLM",
    description: "Notes on running language models locally.",
    live: false,
    accent: "text-amber-400 bg-amber-950/40",
  },
  {
    href: "/telegram",
    name: "Telegram",
    code: "TG",
    description: "Telegram bot experiments.",
    live: false,
    accent: "text-teal-400 bg-teal-950/40",
  },
];

export default function HubPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-900 px-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROJECTS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 transition hover:border-indigo-400"
            >
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold ${p.accent}`}
              >
                {p.code}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14.5px] font-medium text-zinc-100 group-hover:text-indigo-400">
                    {p.name}
                  </span>
                  <span
                    className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      p.live ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {p.live ? "Live" : "Coming soon"}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-zinc-500">{p.description}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6">
          <WorkScheduleCalendar />
        </div>
      </div>
    </div>
  );
}
