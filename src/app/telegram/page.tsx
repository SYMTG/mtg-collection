"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const DIAGRAM = `
flowchart TD
    subgraph DISCORD["🎮 Discord"]
        PUB["Публичный сервер игроков<br/>#объявления (Announcement-канал)"]
        OWN["Личный сервер пользователя<br/>Follow Channel"]
        PUB -- "Follow, без прав админа" --> OWN
    end

    subgraph VPS["🖥️ VPS — Hetzner, 4 ГБ RAM / 2 vCPU"]
        BRIDGE["discord-bridge<br/>discord.js, только чтение"]
        OLLAMA["ollama<br/>Llama 3.2 1B · 2 ГБ / 1.5 CPU"]
        BOT["telegram-basic-bot<br/>grammy · long polling"]
        PORTAINER["portainer<br/>127.0.0.1:9443, только SSH-туннель"]
        BRIDGE -- "классификация: анонс?" --> OLLAMA
        BOT -- "суммаризация" --> OLLAMA
    end

    subgraph TG["✈️ Telegram"]
        USERS["Whitelist — 2 Telegram ID<br/>ALLOWED_TG_IDS"]
    end

    OWN -- "новое сообщение" --> BRIDGE
    BRIDGE -- "если анонс турнира" --> USERS
    USERS -- "/hello, /summarize" --> BOT
    BOT --> USERS

    style DISCORD fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff
    style VPS fill:#27272a,stroke:#71717a,color:#e4e4e7
    style TG fill:#052e2b,stroke:#10b981,color:#d1fae5
`;

const STATS = [
  { value: "$0", unit: "/мес", label: "поверх уже оплаченного VPN-сервера" },
  { value: "1B", unit: "", label: "параметров — Llama 3.2, локально на CPU" },
  { value: "4", unit: "", label: "контейнера: bot, ollama, discord-bridge, portainer" },
  { value: "2", unit: "", label: "Telegram ID в белом списке" },
];

export default function TelegramPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          background: "#09090b",
          primaryColor: "#27272a",
          primaryTextColor: "#f4f4f5",
          primaryBorderColor: "#6366f1",
          lineColor: "#71717a",
          secondaryColor: "#3f3f46",
          tertiaryColor: "#27272a",
          fontSize: "16px",
        },
      });

      try {
        const { svg } = await mermaid.render("telegram-diagram", DIAGRAM.trim());
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled) setError("Не удалось отрисовать диаграмму");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-5xl">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Telegram</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Whitelist-бот на VPS: hello-world → Discord-мост → локальный LLM.
            </p>
          </div>
          <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to projects
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-zinc-950 p-4">
              <div className="font-mono text-lg font-semibold tracking-tight text-zinc-100 [font-variant-numeric:tabular-nums]">
                {s.value}
                {s.unit && <span className="text-sm font-medium text-zinc-500">{s.unit}</span>}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 shadow-lg">
          <div className="overflow-x-auto p-4">
            <div ref={containerRef} className="min-w-[760px]" />
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
              Discord — публичный сервер + личный (Follow)
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-zinc-500" />
              VPS — Docker Compose, общий сервер с VPN
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              Telegram — конечные пользователи
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
              Работает автоматически
            </div>
            <p className="mt-1.5 text-sm text-zinc-300">
              Анонс турнира на паблик-сервере → Follow Channel дублирует его на
              личный сервер → <code className="text-zinc-100">discord-bridge</code>{" "}
              видит сообщение → Ollama классифицирует → пуш в Telegram, без участия человека.
            </p>
          </div>
          <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/30 p-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-indigo-400">
              По команде
            </div>
            <p className="mt-1.5 text-sm text-zinc-300">
              <code className="text-zinc-100">/hello</code> и{" "}
              <code className="text-zinc-100">/summarize &lt;текст&gt;</code> в
              Telegram — сразу отвечает бот, суммаризация идёт через ту же
              локальную модель.
            </p>
          </div>
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-amber-400">
              Ручной шаг
            </div>
            <p className="mt-1.5 text-sm text-zinc-300">
              Суммаризация обычных (не Announcement) обсуждений на паблик-сервере —
              бота туда не посадить без прав админа, поэтому текст ветки
              вставляется вручную.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-zinc-800 pt-3 text-xs text-zinc-600">
          <span>
            Зеркало{" "}
            <code className="text-zinc-500">
              SYS Brain/01_Projects/Telegram/Basic bot/Telegram_Bot_Architecture.md
            </code>
          </span>
          <span className="text-zinc-500">VPS Hetzner · github.com/SYMTG/telegram-basic-bot</span>
        </div>
      </div>
    </div>
  );
}
