"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Main", match: (p: string) => p === "/" },
  { href: "/mtg", label: "Singles", match: (p: string) => p === "/mtg" || p.startsWith("/mtg/sets") || p === "/mtg/search" },
  { href: "/mtg/sealed", label: "Sealed", match: (p: string) => p.startsWith("/mtg/sealed") },
  { href: "/mtg/reports", label: "Reports", match: (p: string) => p.startsWith("/mtg/reports") },
  { href: "/mtg/infra", label: "Infra", match: (p: string) => p === "/mtg/infra" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="w-full bg-zinc-900 px-4 text-zinc-100">
      <div className="mx-auto flex max-w-5xl items-center gap-1 py-3">
        {LINKS.map((l) => {
          const active = l.match(pathname);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
