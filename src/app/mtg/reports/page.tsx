import Link from "next/link";

export default function ReportsPage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-5xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/mtg/reports/sets"
            className="group rounded-lg border border-zinc-800 bg-zinc-950 p-4 hover:border-indigo-400"
          >
            <div className="font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500 group-hover:text-indigo-400">
              Set Value
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
