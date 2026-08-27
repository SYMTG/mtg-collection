"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CollectionButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = pathname === "/" && searchParams.get("collection") === "1";
  const href = active ? "/" : "/?collection=1";

  return (
    <Link
      href={href}
      title="Show only sets with cards in your collection"
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm transition ${
        active
          ? "border-indigo-400 bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-indigo-500/30"
          : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-indigo-400 hover:text-white"
      }`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.4l-4.8 2.5.9-5.4L2.2 7.7l5.4-.8L10 2z" />
      </svg>
      Collection
    </Link>
  );
}

export default function TopNav() {
  return (
    <header className="w-full bg-zinc-900 text-zinc-100">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex flex-shrink-0 items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 text-indigo-400"
            fill="currentColor"
          >
            <rect x="3" y="4" width="14" height="18" rx="2" opacity="0.35" />
            <rect x="7" y="2" width="14" height="18" rx="2" />
          </svg>
          <span className="hidden text-sm font-bold tracking-tight sm:inline">
            Y Family MTG Collection
          </span>
        </Link>

        <Suspense fallback={null}>
          <CollectionButton />
        </Suspense>

        <div className="flex-1" />

        <nav className="flex flex-shrink-0 items-center gap-1">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M3 17V9h3v8H3zm5.5 0V3h3v14h-3zM14 17v-6h3v6h-3z" />
            </svg>
            <span className="hidden md:inline">Reports</span>
          </Link>

          <a
            href="#"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            <svg viewBox="0 0 30 30" className="h-4 w-4" fill="currentColor">
              <path d="M15 2c-3.296 5.789-5.713 13.983-15 6l4 12v8h22v-8l4-12c-9.287 7.983-11.704-.211-15-6zm-9 24v-4h18v4h-18zm18-6.324v.324h-18v-.324l-2.32-6.962c5.055 1.849 8.383-.683 11.32-6.475 2.938 5.792 6.266 8.323 11.32 6.475l-2.32 6.962z" />
            </svg>
            <span className="hidden md:inline">Storage</span>
          </a>

          <div className="mx-1 h-5 w-px bg-zinc-700" />

          <a
            href="#"
            title="Sign In"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <circle cx="10" cy="6.5" r="3.5" />
              <path d="M3 18c0-3.6 3.13-6 7-6s7 2.4 7 6v.5H3V18z" />
            </svg>
            <span className="sr-only">Sign In</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
