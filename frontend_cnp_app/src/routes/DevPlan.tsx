import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  exportProfilePdf,
  getPlan,
  savePlan,
  rpcGapAnalysis,
  getCurrentUserProfile,
} from "../lib/api";
import type {
  GapBreakdown,
  GapAnalysisResult,
  Plan,
  PlanItem,
  UUID,
  UserProfile,
  UIPlanItem,
} from "../lib/types";

// UI helpers
type Phase = 1 | 2 | 3 | 4;
const PHASE_LABEL: Record<Phase, string> = {
  1: "Phase 1 (0–3 mo)",
  2: "Phase 2 (3–6 mo)",
  3: "Phase 3 (6–12 mo)",
  4: "Phase 4 (12–18 mo)",
};
const PRIORITIES = ["P1", "P2", "P3"] as const;
const STATUSES = ["Not Started", "In Progress", "Blocked", "Done"] as const;



// Utilities to encode/decode extra fields into description for MVP without altering DB schema
const SEP = "\n---meta---\n";
function encodeMetaDescription(desc: string | undefined, meta: Partial<Pick<UIPlanItem, "phase" | "priority" | "status">>): string {
  const base = (desc || "").split(SEP)[0]; // strip any old meta
  const payload = JSON.stringify({
    phase: meta.phase ?? null,
    priority: meta.priority ?? null,
    status: meta.status ?? null,
  });
  return `${base}${SEP}${payload}`;
}
function decodeMetaDescription(desc?: string): {
  description: string | undefined;
  phase?: Phase;
  priority?: typeof PRIORITIES[number];
  status?: typeof STATUSES[number];
} {
  if (!desc) return { description: undefined };
  const [base, meta] = desc.split(SEP);
  if (!meta) return { description: base };
  try {
    const obj = JSON.parse(meta);
    return {
      description: base,
      phase: obj?.phase ?? undefined,
      priority: obj?.priority ?? undefined,
      status: obj?.status ?? undefined,
    };
  } catch {
    return { description: base };
  }
}

// PUBLIC_INTERFACE
export function DevPlan(): JSX.Element {
  /** Development plan builder and exports:
   * - Load or create user's plan
   * - Generate items from rpc_gap_analysis top gaps
   * - Edit fields: phase, due_date, priority, status
   * - Persist with RLS-safe upserts
   * - Optimistic updates with loading/error
   * - Export PDF via Edge Function returning Blob/signed URL
   */
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<UIPlanItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [gap, setGap] = useState<GapAnalysisResult | null>(null);

  // Load profile, then plan (create if needed)
  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const { data: prof, error: e1 } = await getCurrentUserProfile();
        if (e1) throw new Error(e1);
        if (!prof) throw new Error("Profile not found. Complete your profile first.");
        if (!mounted) return;
        setProfile(prof);

        // Attempt to find an existing plan (simple strategy: pick the latest)
        const { data: plans, error: eList } = await supabase
          .from("plans")
          .select("*")
          .eq("profile_id", prof.id)
          .order("created_at", { ascending: false });
        if (eList) throw eList;
        let chosen: Plan | null = null;
        if (plans && plans.length > 0) {
          // pick latest
          chosen = plans[0] as Plan;
        } else {
          // create one
          const title = "18-month Development Plan";
          const { data: created, error: eCreate } = await supabase
            .from("plans")
            .insert({ title, profile_id: prof.id })
            .select("*")
            .single();
          if (eCreate) throw eCreate;
          chosen = created as Plan;
        }
        if (!mounted) return;
        setPlan(chosen);

        // Load items
        const { data: loaded, error: eItems } = await supabase
          .from("plan_items")
          .select("*")
          .eq("plan_id", chosen.id)
          .order("created_at", { ascending: true });
        if (eItems) throw eItems;

        const uiItems: UIPlanItem[] =
          (loaded as PlanItem[] | null)?.map((i) => {
            const m = decodeMetaDescription(i.description);
            return { ...i, ...m };
          }) ?? [];
        setItems(uiItems);

        // Load gap analysis if target role present
        if (prof.role_target_code) {
          const gapRes = await rpcGapAnalysis(prof.id, prof.role_target_code);
          if (!gapRes.error && gapRes.data) {
            setGap(gapRes.data);
          }
        }
      } catch (err: any) {
        const msg = err?.message || "Failed to initialize";
        setError(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const groupedByPhase = useMemo(() => {
    const map: Record<Phase, UIPlanItem[]> = { 1: [], 2: [], 3: [], 4: [] };
    items.forEach((it) => {
      const phase = (it.phase as Phase) || 1;
      map[phase].push(it);
    });
    return map;
  }, [items]);

  function onFieldChange(id: UUID, patch: Partial<UIPlanItem>) {
    // optimistic local update
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch, optimistic: true } : it))
    );
  }

  async function handleAddFromGaps() {
    if (!profile || !plan) return;
    if (!gap || !gap.breakdown?.length) {
      setError("No gap analysis available. Set a target role in Profile.");
      return;
    }
    setError(null);
    // pick top 5 deficits
    const top = [...gap.breakdown]
      .filter((g) => g.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);

    if (top.length === 0) {
      setError("No gaps detected for your target role.");
      return;
    }

    // Create new items locally (optimistic)
    const optimisticItems: UIPlanItem[] = top.map((g, idx) => {
      const title = `Close gap in ${g.competency_id}`;
      const desc = `Action to improve competency ${g.competency_id}.`;
      const tmpId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${idx}`;
      const encoded = encodeMetaDescription(desc, { phase: (idx < 2 ? 1 : idx < 4 ? 2 : 3) as Phase });
      const decoded = decodeMetaDescription(encoded);
      return {
        id: tmpId,
        plan_id: plan.id,
        competency_id: g.competency_id,
        title,
        description: encoded,
        impact: Math.min(100, Math.max(30, Math.round(g.delta))), // rough mapping
        completion: 0,
        optimistic: true,
        // decoupled decoded fields to render (exclude description to avoid duplication)
        phase: decoded.phase,
        priority: decoded.priority,
        status: decoded.status,
      };
    });

    setItems((prev) => [...optimisticItems, ...prev]);

    // Persist to DB
    try {
      const payload = optimisticItems.map((it) => ({
        plan_id: it.plan_id,
        competency_id: it.competency_id ?? null,
        title: it.title,
        description: it.description,
        impact: it.impact ?? null,
        completion: it.completion ?? 0,
        due_date: it.due_date ? it.due_date.split("T")[0] : null,
      }));
      const { data, error } = await supabase.from("plan_items").insert(payload).select("*");
      if (error) throw error;

      // Reconcile local temp ids with real ids
      setItems((prev) => {
        // remove optimistic created ones by title/competency match then add inserted
        const persisted = (data as PlanItem[]).map((row) => ({
          ...row,
          ...decodeMetaDescription(row.description),
          optimistic: false,
        })) as UIPlanItem[];
        const withoutTemps = prev.filter((p) => !optimisticItems.some((o) => o.title === p.title && o.competency_id === p.competency_id));
        return [...persisted, ...withoutTemps];
      });
    } catch (e: any) {
      setError(e?.message || "Failed to add items from gaps");
      // rollback optimistic adds
      setItems((prev) => prev.filter((p) => !optimisticItems.some((o) => o.id === p.id)));
    }
  }

  async function handleSaveAll() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      // Encode UI meta into description before save
      const toPersist: PlanItem[] = items.map((it) => {
        const desc = encodeMetaDescription(it.description, {
          phase: it.phase,
          priority: it.priority,
          status: it.status,
        });
        const due = it.due_date ? String(it.due_date).split("T")[0] : undefined;
        return {
          id: it.id,
          plan_id: plan.id,
          competency_id: it.competency_id || undefined,
          skill_id: it.skill_id || undefined,
          title: it.title,
          description: desc,
          impact: typeof it.impact === "number" ? it.impact : undefined,
          completion: typeof it.completion === "number" ? it.completion : 0,
          due_date: due,
          created_at: it.created_at,
        };
      });

      const toSave: Plan = {
        id: plan.id,
        profile_id: plan.profile_id,
        title: plan.title,
        items: toPersist,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      };

      const res = await savePlan(toSave);
      if (res.error) throw new Error(res.error);

      // reload items to ensure server state
      const re = await supabase.from("plan_items").select("*").eq("plan_id", plan.id);
      if (re.error) throw re.error;
      const rehydrated: UIPlanItem[] = (re.data as PlanItem[]).map((r) => ({
        ...r,
        ...decodeMetaDescription(r.description),
        optimistic: false,
      }));
      setItems(rehydrated);
    } catch (err: any) {
      setError(err?.message || "Failed to save plan");
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPdf() {
    if (!profile) return;
    setExporting(true);
    setError(null);
    setExportUrl(null);
    try {
      const resp = await exportProfilePdf(profile.id);
      if (resp.error || !resp.data) throw new Error(resp.error || "Failed to export");
      const blob = resp.data;
      const url = URL.createObjectURL(blob);
      setExportUrl(url);
    } catch (e: any) {
      setError(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleAddBlank() {
    if (!plan) return;
    const tmpId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
    const baseText = "Describe the action and intended outcome.";
    const encoded = encodeMetaDescription(baseText, { phase: 1 });
    const decoded = decodeMetaDescription(encoded);
    const blank: UIPlanItem = {
      id: tmpId,
      plan_id: plan.id,
      title: "New action",
      description: encoded,
      completion: 0,
      optimistic: true,
      phase: decoded.phase,
      priority: decoded.priority,
      status: decoded.status,
    };
    setItems((prev) => [blank, ...prev]);

    try {
      const { data, error } = await supabase
        .from("plan_items")
        .insert({
          plan_id: plan.id,
          title: blank.title,
          description: blank.description,
          completion: 0,
        })
        .select("*")
        .single();
      if (error) throw error;
      const saved = data as PlanItem;
      setItems((prev) =>
        prev.map((i) =>
          i.id === tmpId ? { ...saved, ...decodeMetaDescription(saved.description), optimistic: false } : i
        )
      );
    } catch (e: any) {
      setError(e?.message || "Failed to create item");
      // rollback
      setItems((prev) => prev.filter((i) => i.id !== tmpId));
    }
  }

  async function handleDelete(id: UUID) {
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    try {
      const { error } = await supabase.from("plan_items").delete().eq("id", id);
      if (error) throw error;
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
      setItems(prev); // rollback
    }
  }

  if (loading) {
    return <div className="container" aria-busy="true">Loading plan…</div>;
  }
  if (error) {
    return (
      <section>
        <h1 className="title">Development Plan</h1>
        <div role="alert" style={{ color: "var(--ocean-error)", marginTop: 8 }}>{error}</div>
      </section>
    );
  }

  return (
    <section>
      <h1 className="title">Development Plan</h1>
      <p className="description">Build your 6–18 month development plan and export artifacts.</p>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="theme-toggle" onClick={handleAddBlank}>Add action</button>
        <button className="theme-toggle" onClick={handleAddFromGaps} disabled={!gap || !gap.breakdown?.length}>
          Generate from gaps
        </button>
        <button className="theme-toggle" onClick={handleSaveAll} disabled={saving}>
          {saving ? "Saving…" : "Save all"}
        </button>
        <button className="theme-toggle" onClick={handleExportPdf} disabled={exporting || !profile}>
          {exporting ? "Exporting…" : "Export PDF"}
        </button>
        {exportUrl && (
          <a className="navlink" href={exportUrl} target="_blank" rel="noreferrer">
            Open exported PDF
          </a>
        )}
      </div>

      {/* Gap summary */}
      {gap && (
        <div style={{ padding: 12, background: "var(--ocean-surface)", borderRadius: 8, border: "1px solid var(--border-color)", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Readiness {(Number(gap.readiness ?? 0) * 100).toFixed(0)}% • Overlap {(Number((gap as any).overlap ?? gap.overlapRatio ?? 0) * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
            Top gaps: {gap.breakdown.filter(b => b.delta > 0).slice(0, 5).map(b => b.competency_id).join(", ") || "None"}
          </div>
        </div>
      )}

      {/* Items grouped by phase */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(220px, 1fr))", gap: 12 }}>
        {(Object.keys(PHASE_LABEL) as Array<unknown> as Phase[]).map((ph) => (
          <div key={ph} style={{ background: "var(--ocean-surface)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{PHASE_LABEL[ph]}</div>
            {groupedByPhase[ph].length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>No items</div>
            ) : (
              groupedByPhase[ph].map((it) => (
                <div key={it.id} style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: 8, marginBottom: 8, background: it.optimistic ? "#fffef5" : "var(--ocean-bg)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      aria-label="Title"
                      value={it.title}
                      onChange={(e) => onFieldChange(it.id, { title: e.target.value })}
                      style={{ flex: 1, padding: 6 }}
                    />
                    <button className="theme-toggle" onClick={() => handleDelete(it.id)}>✕</button>
                  </div>
                  <div>
                    <textarea
                      aria-label="Description"
                      value={decodeMetaDescription(it.description).description || ""}
                      onChange={(e) => onFieldChange(it.id, { description: encodeMetaDescription(e.target.value, { phase: it.phase, priority: it.priority, status: it.status }) })}
                      rows={3}
                      style={{ width: "100%", marginTop: 6 }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                    <label style={{ fontSize: 12 }}>
                      Due date
                      <input
                        type="date"
                        value={(it.due_date || "").split("T")[0] || ""}
                        onChange={(e) => onFieldChange(it.id, { due_date: e.target.value })}
                        style={{ width: "100%" }}
                      />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Priority
                      <select
                        value={it.priority || ""}
                        onChange={(e) => onFieldChange(it.id, { priority: (e.target.value || undefined) as any })}
                        style={{ width: "100%" }}
                      >
                        <option value="">—</option>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Status
                      <select
                        value={it.status || ""}
                        onChange={(e) => onFieldChange(it.id, { status: (e.target.value || undefined) as any })}
                        style={{ width: "100%" }}
                      >
                        <option value="">—</option>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Impact
                      <input
                        type="number" min={0} max={100}
                        value={Number(it.impact ?? 0)}
                        onChange={(e) => onFieldChange(it.id, { impact: Number(e.target.value) })}
                        style={{ width: "100%" }}
                      />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Completion %
                      <input
                        type="number" min={0} max={100}
                        value={Number(it.completion ?? 0)}
                        onChange={(e) => onFieldChange(it.id, { completion: Number(e.target.value) })}
                        style={{ width: "100%" }}
                      />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Phase
                      <select
                        value={String(it.phase || ph)}
                        onChange={(e) => onFieldChange(it.id, { phase: Number(e.target.value) as Phase })}
                        style={{ width: "100%" }}
                      >
                        <option value="1">Phase 1</option>
                        <option value="2">Phase 2</option>
                        <option value="3">Phase 3</option>
                        <option value="4">Phase 4</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
