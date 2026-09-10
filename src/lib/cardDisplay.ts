// Shared display constants for rendering a card's rarity/finish/border/condition,
// used by both the set detail page and the search results page.

export const RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  special: 3,
  mythic: 4,
  bonus: 5,
};

export const RARITY_LABEL: Record<string, string> = {
  common: "C",
  uncommon: "U",
  rare: "R",
  mythic: "M",
  special: "S",
  bonus: "B",
};

export const RARITY_STYLE: Record<string, string> = {
  common: "bg-zinc-800 text-zinc-300",
  uncommon: "bg-sky-900/40 text-sky-300",
  rare: "bg-yellow-900/40 text-yellow-300",
  mythic: "bg-orange-900/40 text-orange-400",
  special: "bg-violet-900/40 text-violet-300",
  bonus: "bg-teal-900/40 text-teal-300",
};

export const finishLabel: Record<string, string> = {
  nonfoil: "Non-foil",
  foil: "Foil",
  etched: "Etched",
};

export const finishStyle: Record<string, string> = {
  nonfoil: "bg-zinc-800 text-zinc-300",
  foil: "bg-amber-900/40 text-amber-300",
  etched: "bg-violet-900/40 text-violet-300",
};

export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

export const BORDER_STYLE: Record<string, string> = {
  Regular: "bg-zinc-800 text-zinc-300",
  "Full Art": "bg-emerald-900/40 text-emerald-300",
  Borderless: "bg-fuchsia-900/40 text-fuchsia-300",
  "Extended Art": "bg-blue-900/40 text-blue-300",
  Showcase: "bg-rose-900/40 text-rose-300",
};

export type BorderInfo = {
  border_color: string | null;
  full_art: boolean;
  frame_effects: string[] | null;
};

export function borderLabel(c: BorderInfo): string {
  const effects = c.frame_effects ?? [];
  if (effects.includes("showcase")) return "Showcase";
  if (c.border_color === "borderless") return "Borderless";
  if (c.full_art) return "Full Art";
  if (effects.includes("extendedart")) return "Extended Art";
  return "Regular";
}

export type CollectionEntry = {
  id: string;
  card_id: string;
  finish: string;
  condition: string;
  quantity: number;
};
