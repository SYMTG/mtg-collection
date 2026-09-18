"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

const CLASSES = ["Vanguard", "Ranger", "Controller", "Hunter", "Striker", "Psionic"];
const ROLES = ["Support", "Tank", "PassiveDPS", "ActiveDPS", "DOT"];
const ATTRIBUTES = ["Void", "Order", "Justice", "Instinct", "Passion"];
const TIERS = ["S", "A", "B", "C", "D"];
const RARITIES = [5, 4];

type RosterRow = {
  id: string;
  owned: boolean;
  tier: string | null;
  level: number | null;
  ego: number | null;
  potential: string | null;
  signature_partner: string | null;
  equipment: string | null;
  save_date: string | null;
  czn_agents: { id: string; name: string; class: string; role: string; attribute: string; rarity: number } | null;
};

type EconomySnapshot = {
  snapshot_date: string;
  crystals: number;
  lb_pulls: number;
  lb_pity: number | null;
  lb_guaranteed: boolean;
  sb_pulls: number;
  sb_pity: number | null;
  combatants_owned: number | null;
  combatants_total: number | null;
  selector: number | null;
  ego_stone: number | null;
};

const tierRank = (t: string | null) => (t ? TIERS.indexOf(t) : TIERS.length);

export default function CznPage() {
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [economy, setEconomy] = useState<EconomySnapshot | null>(null);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [attributeFilter, setAttributeFilter] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClass, setNewClass] = useState(CLASSES[0]);
  const [newRole, setNewRole] = useState(ROLES[0]);
  const [newAttribute, setNewAttribute] = useState(ATTRIBUTES[0]);
  const [newRarity, setNewRarity] = useState(RARITIES[0]);
  const [newOwned, setNewOwned] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    class: string;
    role: string;
    attribute: string;
    rarity: number;
    owned: boolean;
    tier: string;
    level: string;
    ego: string;
    potential: string;
    signaturePartner: string;
    equipment: string;
    saveDate: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function fetchRoster(): Promise<{ rows: RosterRow[] } | { error: string }> {
    const { data, error } = await supabase
      .from("czn_roster")
      .select(
        "id,owned,tier,level,ego,potential,signature_partner,equipment,save_date,czn_agents(id,name,class,role,attribute,rarity)"
      );
    if (error) return { error: error.message };
    return { rows: (data ?? []) as unknown as RosterRow[] };
  }

  const applyRoster = useCallback((result: Awaited<ReturnType<typeof fetchRoster>>) => {
    if ("error" in result) {
      setLoadError(result.error);
      return;
    }
    setRows(result.rows);
  }, []);

  useEffect(() => {
    fetchRoster().then((result) => applyRoster(result));
    supabase
      .from("czn_economy_snapshots")
      .select(
        "snapshot_date,crystals,lb_pulls,lb_pity,lb_guaranteed,sb_pulls,sb_pity,combatants_owned,combatants_total,selector,ego_stone"
      )
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setEconomy(data as EconomySnapshot | null));
  }, [applyRoster]);

  const sortedRows = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        const agent = r.czn_agents;
        if (!agent) return false;
        if (q && !agent.name.toLowerCase().includes(q)) return false;
        if (classFilter && agent.class !== classFilter) return false;
        if (attributeFilter && agent.attribute !== attributeFilter) return false;
        if (ownedOnly && !r.owned) return false;
        return true;
      })
      .sort((a, b) => {
        const t = tierRank(a.tier) - tierRank(b.tier);
        if (t !== 0) return t;
        return (a.czn_agents?.name ?? "").localeCompare(b.czn_agents?.name ?? "");
      });
  }, [rows, search, classFilter, attributeFilter, ownedOnly]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setLoadError(null);
    try {
      const { data: agent, error: agentError } = await supabase
        .from("czn_agents")
        .upsert(
          { name: newName.trim(), class: newClass, role: newRole, attribute: newAttribute, rarity: newRarity },
          { onConflict: "name" }
        )
        .select("id")
        .single();
      if (agentError || !agent) throw agentError ?? new Error("Upsert failed");

      const { error: rosterError } = await supabase
        .from("czn_roster")
        .upsert({ agent_id: agent.id, owned: newOwned }, { onConflict: "agent_id" });
      if (rosterError) throw rosterError;

      setNewName("");
      setNewOwned(false);
      applyRoster(await fetchRoster());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to add agent");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: RosterRow) {
    const agent = row.czn_agents;
    if (!agent) return;
    setEditingId(row.id);
    setEditError(null);
    setEditDraft({
      name: agent.name,
      class: agent.class,
      role: agent.role,
      attribute: agent.attribute,
      rarity: agent.rarity,
      owned: row.owned,
      tier: row.tier ?? "",
      level: row.level?.toString() ?? "",
      ego: row.ego?.toString() ?? "",
      potential: row.potential ?? "",
      signaturePartner: row.signature_partner ?? "",
      equipment: row.equipment ?? "",
      saveDate: row.save_date ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  }

  async function handleSaveEdit(row: RosterRow) {
    if (!editDraft || !editDraft.name.trim() || !row.czn_agents) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const { error: agentError } = await supabase
        .from("czn_agents")
        .update({
          name: editDraft.name.trim(),
          class: editDraft.class,
          role: editDraft.role,
          attribute: editDraft.attribute,
          rarity: editDraft.rarity,
        })
        .eq("id", row.czn_agents.id);
      if (agentError) throw agentError;

      const { error: rosterError } = await supabase
        .from("czn_roster")
        .update({
          owned: editDraft.owned,
          tier: editDraft.tier || null,
          level: editDraft.level ? parseInt(editDraft.level, 10) : null,
          ego: editDraft.ego ? parseInt(editDraft.ego, 10) : null,
          potential: editDraft.potential || null,
          signature_partner: editDraft.signaturePartner || null,
          equipment: editDraft.equipment || null,
          save_date: editDraft.saveDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (rosterError) throw rosterError;

      cancelEdit();
      applyRoster(await fetchRoster());
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  }

  const pullsAvailable = economy ? Math.floor(economy.crystals / 160) + economy.lb_pulls : null;
  const combatantsOwned = rows?.filter((r) => r.owned).length ?? null;
  const combatantsTotal = rows?.length ?? null;
  const combatantsPct =
    combatantsOwned != null && combatantsTotal ? Math.round((combatantsOwned / combatantsTotal) * 100) : null;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-5xl">
        <div className="mb-6 flex items-baseline gap-3">
          <h1 className="text-xl font-bold text-zinc-100">CZN</h1>
          <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to projects
          </Link>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-zinc-800 sm:grid-cols-4">
          <div className="border-l border-zinc-800 p-4 first:border-l-0">
            <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">
              {economy ? economy.crystals.toLocaleString() : "—"}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">Crystals</div>
            {economy && <div className="mt-2 text-[10.5px] text-zinc-600">as of {economy.snapshot_date}</div>}
          </div>
          <div className="border-l border-zinc-800 p-4">
            <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
              {pullsAvailable ?? "—"}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">LB pulls available</div>
            {economy && (
              <div className="mt-2 text-[10.5px] text-zinc-600">
                Pity {economy.lb_pity ?? "—"}
                {economy.lb_guaranteed ? " · guaranteed" : ""}
              </div>
            )}
          </div>
          <div className="border-l border-zinc-800 p-4">
            <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">
              {economy?.sb_pulls ?? "—"}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">SB pulls</div>
            {economy && <div className="mt-2 text-[10.5px] text-zinc-600">Pity {economy.sb_pity ?? "—"}</div>}
          </div>
          <div className="border-l border-zinc-800 p-4">
            <div className="font-mono text-lg font-semibold tabular-nums text-zinc-100">
              {combatantsOwned != null ? `${combatantsOwned}/${combatantsTotal}` : "—"}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">Combatants owned</div>
            {combatantsPct != null && <div className="mt-2 text-[10.5px] text-zinc-600">{combatantsPct}%</div>}
          </div>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAdd}
            className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4"
          >
            <div className="flex flex-1 min-w-[160px] flex-col gap-1">
              <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Agent name"
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Class</label>
              <select
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
              >
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Attribute</label>
              <select
                value={newAttribute}
                onChange={(e) => setNewAttribute(e.target.value)}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
              >
                {ATTRIBUTES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Rarity</label>
              <select
                value={newRarity}
                onChange={(e) => setNewRarity(parseInt(e.target.value, 10))}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
              >
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {r}★
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1.5 pb-1.5 text-[13px] text-zinc-300">
              <input
                type="checkbox"
                checked={newOwned}
                onChange={(e) => setNewOwned(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Owned
            </label>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-md border border-zinc-800 px-4 py-1.5 text-[13px] font-medium text-zinc-300 hover:border-zinc-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </form>
        )}

        {loadError && <p className="mt-3 text-sm text-red-400">{loadError}</p>}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-[13px] font-medium ${
              showAddForm
                ? "border-indigo-400 bg-indigo-950/60 text-indigo-300"
                : "border-zinc-800 text-zinc-400 hover:border-indigo-400 hover:text-indigo-400"
            }`}
          >
            + Add agent
          </button>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-56 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
          />
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
          >
            <option value="">Class: all</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={attributeFilter}
            onChange={(e) => setAttributeFilter(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
          >
            <option value="">Attribute: all</option>
            {ATTRIBUTES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            onClick={() => setOwnedOnly((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-[13px] font-medium ${
              ownedOnly
                ? "border-indigo-400 bg-indigo-950/60 text-indigo-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            Owned only
          </button>
          {(search || classFilter || attributeFilter || ownedOnly) && (
            <span className="text-[12px] text-zinc-500">
              {sortedRows?.length ?? 0} of {rows?.length ?? 0}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-[16px_1fr_110px_90px_60px_60px_60px_60px_60px_60px_60px_60px_70px] items-center gap-2 border-b border-zinc-700 px-1 pb-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <div />
          <div>Name</div>
          <div>Class</div>
          <div>Attribute</div>
          <div className="text-center">★</div>
          <div className="text-center">Tier</div>
          <div className="text-center">Lvl</div>
          <div className="text-center">Ego</div>
          <div className="text-center">Pot</div>
          <div className="text-center">Equip</div>
          <div className="text-center">SD</div>
          <div>SP</div>
          <div className="text-right">Actions</div>
        </div>

        <div>
          {sortedRows?.map((row) => {
            const agent = row.czn_agents;
            if (!agent) return null;
            const isEditing = editingId === row.id;
            return (
              <Fragment key={row.id}>
                <div className="grid grid-cols-[16px_1fr_110px_90px_60px_60px_60px_60px_60px_60px_60px_60px_70px] items-center gap-2 border-b border-zinc-800 px-1 py-3">
                  <div className="flex items-center justify-center">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${row.owned ? "bg-emerald-500" : "bg-zinc-700"}`}
                      title={row.owned ? "Owned" : "Not owned"}
                    />
                  </div>
                  <div className="truncate text-[13.5px] font-medium text-zinc-100">{agent.name}</div>
                  <div className="text-[12.5px] text-zinc-400">{agent.class}</div>
                  <div className="text-[12.5px] text-zinc-400">{agent.attribute}</div>
                  <div
                    className={`text-center font-mono text-[13px] tabular-nums ${
                      agent.rarity === 5 ? "text-emerald-400" : "text-zinc-300"
                    }`}
                  >
                    {agent.rarity}
                  </div>
                  <div
                    className={`text-center font-mono text-[13px] tabular-nums ${
                      row.tier === "S" ? "text-emerald-400" : "text-zinc-100"
                    }`}
                  >
                    {row.tier ?? "—"}
                  </div>
                  <div
                    className={`text-center font-mono text-[13px] tabular-nums ${
                      row.level === 62 ? "text-emerald-400" : "text-zinc-300"
                    }`}
                  >
                    {row.level ?? "—"}
                  </div>
                  <div
                    className={`text-center font-mono text-[13px] tabular-nums ${
                      row.ego === 6 ? "text-emerald-400" : "text-zinc-300"
                    }`}
                  >
                    {row.ego ?? "—"}
                  </div>
                  <div
                    className={`text-center font-mono text-[13px] tabular-nums ${
                      row.potential === "S" ? "text-emerald-400" : "text-zinc-300"
                    }`}
                  >
                    {row.potential ?? "—"}
                  </div>
                  <div
                    className={`text-center font-mono text-[13px] tabular-nums ${
                      row.equipment === "S" ? "text-emerald-400" : "text-zinc-300"
                    }`}
                  >
                    {row.equipment ?? "—"}
                  </div>
                  <div
                    className={`text-center font-mono text-[13px] tabular-nums ${
                      row.save_date === "S" ? "text-emerald-400" : "text-zinc-300"
                    }`}
                  >
                    {row.save_date ?? "—"}
                  </div>
                  <div
                    className={`truncate text-[12.5px] ${
                      row.signature_partner ? "text-emerald-400" : "text-zinc-400"
                    }`}
                  >
                    {row.signature_partner ?? "—"}
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => (isEditing ? cancelEdit() : startEdit(row))}
                      className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-indigo-400 hover:text-indigo-400"
                    >
                      {isEditing ? "Cancel" : "Edit"}
                    </button>
                  </div>
                </div>
                {isEditing && editDraft && (
                  <div className="border-b border-zinc-800 bg-zinc-950/60 px-1 py-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Name</label>
                        <input
                          type="text"
                          value={editDraft.name}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                          className="w-32 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Class</label>
                        <select
                          value={editDraft.class}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, class: e.target.value } : d))}
                          className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                        >
                          {CLASSES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Role</label>
                        <select
                          value={editDraft.role}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, role: e.target.value } : d))}
                          className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
                          Attribute
                        </label>
                        <select
                          value={editDraft.attribute}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, attribute: e.target.value } : d))}
                          className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                        >
                          {ATTRIBUTES.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
                          Rarity
                        </label>
                        <select
                          value={editDraft.rarity}
                          onChange={(e) =>
                            setEditDraft((d) => (d ? { ...d, rarity: parseInt(e.target.value, 10) } : d))
                          }
                          className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                        >
                          {RARITIES.map((r) => (
                            <option key={r} value={r}>
                              {r}★
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-1.5 pb-1.5 text-[13px] text-zinc-300">
                        <input
                          type="checkbox"
                          checked={editDraft.owned}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, owned: e.target.checked } : d))}
                          className="h-3.5 w-3.5"
                        />
                        Owned
                      </label>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Tier</label>
                        <select
                          value={editDraft.tier}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, tier: e.target.value } : d))}
                          className="w-16 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                        >
                          <option value="">—</option>
                          {TIERS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Level</label>
                        <input
                          type="number"
                          value={editDraft.level}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, level: e.target.value } : d))}
                          className="w-16 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">Ego</label>
                        <input
                          type="number"
                          value={editDraft.ego}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, ego: e.target.value } : d))}
                          className="w-16 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
                          Potential
                        </label>
                        <input
                          type="text"
                          value={editDraft.potential}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, potential: e.target.value } : d))}
                          placeholder="e.g. A"
                          className="w-16 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
                          Equipment
                        </label>
                        <input
                          type="text"
                          value={editDraft.equipment}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, equipment: e.target.value } : d))}
                          placeholder="e.g. A"
                          className="w-16 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
                          Save Date
                        </label>
                        <input
                          type="text"
                          value={editDraft.saveDate}
                          onChange={(e) => setEditDraft((d) => (d ? { ...d, saveDate: e.target.value } : d))}
                          placeholder="e.g. A"
                          className="w-16 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div className="flex flex-1 min-w-[160px] flex-col gap-1">
                        <label className="font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
                          Signature partner
                        </label>
                        <input
                          type="text"
                          value={editDraft.signaturePartner}
                          onChange={(e) =>
                            setEditDraft((d) => (d ? { ...d, signaturePartner: e.target.value } : d))
                          }
                          placeholder="optional"
                          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400"
                        />
                      </div>
                      <button
                        onClick={cancelEdit}
                        className="rounded-md border border-zinc-800 px-4 py-1.5 text-[13px] font-medium text-zinc-300 hover:border-zinc-600"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(row)}
                        disabled={savingEdit || !editDraft.name.trim()}
                        className="rounded-md bg-indigo-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                    </div>
                    {editError && <p className="mt-2 text-[12.5px] text-red-400">{editError}</p>}
                  </div>
                )}
              </Fragment>
            );
          })}
          {rows && rows.length === 0 && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">
              No agents yet — add your first one above.
            </div>
          )}
          {rows && rows.length > 0 && sortedRows?.length === 0 && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">
              No agents match the current search/filter.
            </div>
          )}
          {rows === null && !loadError && (
            <div className="px-1 py-10 text-center text-sm text-zinc-500">Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}
