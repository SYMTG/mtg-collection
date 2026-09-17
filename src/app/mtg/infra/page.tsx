"use client";

import { useEffect, useRef, useState } from "react";

const DIAGRAM = `
flowchart TD
    subgraph LOCAL["💻 Локально (ваш ноутбук)"]
        DEV["Next.js проект<br/>D:/Projects/mtg-collection<br/>npm run dev"]
        SCRIPTS["Скрипты импорта (scripts/*.mjs)<br/>запускаются вручную, разово"]
        EXCEL["Revision 2026.xlsx + sealed.ods<br/>источники данных, в git не попадают"]
        EXCEL --> SCRIPTS
    end

    subgraph GH["🐙 GitHub"]
        REPO["SYMTG/mtg-collection<br/>ветка main"]
    end

    subgraph VERCEL["▲ Vercel — прод"]
        BUILD["Авто-сборка при каждом push"]
        PROD["mtg-collection-green.vercel.app<br/>закрыт общим паролем"]
        BUILD --> PROD
    end

    subgraph SB["🗄 Supabase — проект MTG"]
        CARDS["cards — 105 407 карт<br/>каталог из Scryfall bulk data"]
        ITEMS["collection_items<br/>карты в коллекции"]
        PRICES["price_history<br/>цена карт по годам, 2015–2026"]
        SPROD["sealed_products<br/>справочник: сет + тип + язык, 121 товар"]
        SITEMS["sealed_items<br/>sealed-товары в наличии"]
        CMSNAP["cardmarket_price_snapshots<br/>+ view _latest, 1073 записи"]
    end

    subgraph CM["🌐 Cardmarket.com (Tampermonkey)"]
        USERSCRIPT["userscript в браузере<br/>клик Save на открытой странице"]
    end

    subgraph SCRYFALL["🌐 Scryfall API"]
        SCRY["cards/collection<br/>текущие USD-цены"]
    end

    DEV -- "git push" --> REPO
    REPO -- "git-интеграция" --> BUILD
    PROD -- "чтение/запись, публичный ключ" --> CARDS
    PROD --> ITEMS
    PROD --> PRICES
    PROD --> SPROD
    PROD --> SITEMS
    PROD --> CMSNAP
    PROD -- "Sync prices, только коллекция" --> SCRY
    USERSCRIPT -- "клик Save snapshot, публичный ключ" --> CMSNAP
    USERSCRIPT -. "то же для новых товаров" .-> SPROD
    SCRIPTS -. "заливка, секретный ключ (только локально)" .-> CARDS
    SCRIPTS -. "заливка" .-> ITEMS
    SCRIPTS -. "заливка" .-> PRICES
    SCRIPTS -. "заливка (121 товар)" .-> SPROD
    SCRIPTS -. "заливка" .-> SITEMS
    SCRIPTS -. "историческая заливка по годам" .-> CMSNAP

    subgraph POC["📦 Устарело: старый POC"]
        POCURL["mtg-collection-poc.vercel.app"]
    end
    POCURL -.-> ITEMS

    style LOCAL fill:#27272a,stroke:#71717a,color:#e4e4e7
    style GH fill:#27272a,stroke:#71717a,color:#e4e4e7
    style VERCEL fill:#27272a,stroke:#818cf8,color:#e4e4e7
    style SB fill:#052e2b,stroke:#10b981,color:#d1fae5
    style CM fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff
    style SCRYFALL fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff
    style POC fill:#3f2d0a,stroke:#f59e0b,color:#fde68a
`;

const STATS = [
  { value: "$0", unit: "/мес", label: "Vercel Hobby + Supabase Free" },
  { value: "105 407", unit: "", label: "карт в каталоге cards" },
  { value: "121", unit: "", label: "sealed-товара (sealed_products)" },
  { value: "3 / ~117", unit: "", label: "вкладок Excel разобрано" },
];

export default function InfraPage() {
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
        const { svg } = await mermaid.render("infra-diagram", DIAGRAM.trim());
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
              <span className="inline-block h-px w-6 bg-zinc-500" />
              автоматически (push → сборка → публичный ключ)
            </span>
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-px w-6 border-t border-dashed border-zinc-500"
              />
              вручную, локально (секретный ключ)
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              Supabase — шесть таблиц
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
              внешний API (без ключа)
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              устаревший компонент
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
              Работает автоматически
            </div>
            <p className="mt-1.5 text-sm text-zinc-300">
              <code className="text-zinc-100">git push</code> в{" "}
              <code className="text-zinc-100">main</code> → Vercel
              пересобирает → сайт обновляется сам, без ручного деплоя.
            </p>
          </div>
          <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/30 p-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-indigo-400">
              По кнопке
            </div>
            <p className="mt-1.5 text-sm text-zinc-300">
              &ldquo;Sync prices&rdquo; на <code className="text-zinc-100">/mtg</code> тянет
              текущие цены со Scryfall прямо из браузера — без ключа, только по
              картам в коллекции.
            </p>
          </div>
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-amber-400">
              Ручной шаг
            </div>
            <p className="mt-1.5 text-sm text-zinc-300">
              Импорт из Excel/ODS и заливка каталога — только локально,
              скриптами, с секретным ключом, который никогда не публикуется.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-zinc-800 pt-3 text-xs text-zinc-600">
          <span>
            Зеркало{" "}
            <code className="text-zinc-500">
              SYS Brain/01_Projects/MTG/Infrastructure.md
            </code>
          </span>
          <span className="text-zinc-500">mtg-collection-green.vercel.app</span>
        </div>
      </div>
    </div>
  );
}
