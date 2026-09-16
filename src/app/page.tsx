import Link from "next/link";
import WorkScheduleCalendar from "@/components/WorkScheduleCalendar";

type Project = {
  href: string;
  name: string;
  code: string;
  description: string;
  live: boolean;
};

const PROJECTS: Project[] = [
  {
    href: "/mtg",
    name: "MTG Collection",
    code: "MTG",
    description: "Personal Magic: The Gathering collection — sets, prices, sealed inventory.",
    live: true,
  },
  {
    href: "/senyacup",
    name: "Senyacup",
    code: "SC",
    description: "Game design project — equipment, characters, world.",
    live: true,
  },
  {
    href: "/czn",
    name: "CZN",
    code: "CZN",
    description: "Data and lore reference for a gacha game roster.",
    live: false,
  },
  {
    href: "/budget",
    name: "Budget",
    code: "B",
    description: "Personal monthly budget tracking.",
    live: false,
  },
  {
    href: "/y-ms",
    name: "Y-M-S",
    code: "YMS",
    description: "Game dev project with my son — task board for ideas and mechanics.",
    live: true,
  },
  {
    href: "/local-llm",
    name: "Local LLM",
    code: "LLM",
    description: "Notes on running language models locally.",
    live: false,
  },
  {
    href: "/telegram",
    name: "Telegram",
    code: "TG",
    description: "Whitelisted bot on a VPS, bridged to Discord via a local LLM.",
    live: true,
  },
];

export default function HubPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-900 px-4 py-12">
      <div className="w-full max-w-3xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500">Projects</p>
        <div className="mt-3 divide-y divide-zinc-800 border-y border-zinc-800">
          {PROJECTS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group flex items-center gap-3 px-1 py-3 hover:bg-zinc-950/60"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-zinc-800 font-mono text-[11px] font-semibold text-zinc-300">
                {p.code}
              </div>
              <div className="min-w-0 flex-1">
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
                <p className="mt-0.5 truncate text-[13px] text-zinc-500">{p.description}</p>
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
