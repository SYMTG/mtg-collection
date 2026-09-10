import Link from "next/link";

export default function LocalLlmPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-900 px-4 py-8 text-center">
      <h1 className="text-2xl font-bold text-zinc-100">Local LLM</h1>
      <p className="text-zinc-400">Coming soon.</p>
      <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
        ← Back to projects
      </Link>
    </div>
  );
}
