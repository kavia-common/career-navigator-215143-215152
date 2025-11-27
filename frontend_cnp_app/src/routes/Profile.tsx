import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getCurrentUserProfile, listRoles, rpcGapAnalysis, rpcRecomputeProfile, upsertCurrentUserProfile } from "../lib/api";
import type { Role, UserProfile } from "../lib/types";

// PUBLIC_INTERFACE
export function Profile(): JSX.Element {
  /**
   * Profile editor:
   * - Load current profile and available roles
   * - Allow editing display name (full_name), selecting current and target role(s)
   * - Persist to Supabase (RLS-safe upsert on profiles)
   * - After save, invoke rpc_gap_analysis (via rpc_recompute_profile for KPI update) to refresh readiness and gaps
   * - Optimistic UI with loading/error states
   */

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [overlap, setOverlap] = useState<number | null>(null);

  // Local editable fields
  const [fullName, setFullName] = useState<string>("");
  const [currentRole, setCurrentRole] = useState<string>("");
  const [targetRole, setTargetRole] = useState<string>("");

  const roleOptions = useMemo(
    () => roles.map((r) => ({ value: r.code, label: `${r.code} — ${r.name}` })),
    [roles]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [profRes, rolesRes] = await Promise.all([getCurrentUserProfile(), listRoles()]);
        if (!active) return;
        if (rolesRes.error) throw new Error(rolesRes.error);
        setRoles(rolesRes.data || []);

        if (profRes.error) {
          // Profile might not exist yet; initialize from auth user
          const { data: auth } = await supabase.auth.getUser();
          const email = auth.user?.email || "";
          const skeleton: UserProfile = {
            id: auth.user?.id || "",
            email,
            full_name: "",
            role_current_code: undefined,
            role_target_code: undefined,
            created_at: undefined,
          };
          setProfile(skeleton);
          setFullName("");
          setCurrentRole("");
          setTargetRole("");
        } else {
          const p = profRes.data!;
          setProfile(p);
          setFullName(p.full_name || "");
          setCurrentRole(p.role_current_code || "");
          setTargetRole(p.role_target_code || "");
        }

        // If we have target role and profile id, fetch readiness via rpc_gap_analysis (best-effort)
        const pid = profRes.data?.id || (await supabase.auth.getUser()).data.user?.id || "";
        const trg = profRes.data?.role_target_code || "";
        if (pid && trg) {
          const gap = await rpcGapAnalysis(pid, trg, { useCache: true });
          if (!gap.error && gap.data) {
            setReadiness(gap.data.readiness);
            setOverlap((gap.data as any).overlap ?? gap.data.overlapRatio ?? null);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load profile.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const disabled = saving || loading;

  const onSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    // Optimistic local update
    const optimistic: UserProfile = {
      ...profile,
      full_name: fullName,
      role_current_code: currentRole || null || undefined,
      role_target_code: targetRole || null || undefined,
    };
    setProfile(optimistic);

    try {
      const upd = await upsertCurrentUserProfile({
        full_name: fullName,
        role_current_code: currentRole || null || undefined,
        role_target_code: targetRole || null || undefined,
      });
      if (upd.error || !upd.data) {
        throw new Error(upd.error || "Save failed");
      }
      setProfile(upd.data);
      setMessage("Profile saved.");

      // Recompute KPIs and readiness via Edge Function (preferred) or rpc_gap_analysis fallback
      const pid = upd.data.id;
      const trg = upd.data.role_target_code || targetRole || "";
      if (pid) {
        const recompute = await rpcRecomputeProfile(pid, trg || undefined);
        if (!recompute.error && recompute.data) {
          // readiness/overlap can be re-fetched from recompute by pairing with separate rpc_gap_analysis if needed
          setMessage("Profile saved. Readiness refreshed.");
        } else if (trg) {
          const gap = await rpcGapAnalysis(pid, trg);
          if (!gap.error && gap.data) {
            setReadiness(gap.data.readiness);
            setOverlap(gap.data.overlap);
            setMessage("Profile saved. Readiness updated.");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h1 className="title">Profile</h1>
      <p className="description">Manage your profile, preferences, and saved plans.</p>

      {loading ? (
        <div role="status" aria-busy="true" style={{ marginTop: 8 }}>
          Loading profile…
        </div>
      ) : (
        <form onSubmit={onSave} style={{ display: "grid", gap: 12, maxWidth: 680 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="full_name">Display name</label>
            <input
              id="full_name"
              type="text"
              placeholder="Your name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={disabled}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-color, rgba(0,0,0,0.12))",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="current_role">Current role</label>
            <select
              id="current_role"
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value)}
              disabled={disabled || (roles.length === 0 && !error)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-color, rgba(0,0,0,0.12))",
                background: "var(--ocean-bg)",
                color: "var(--ocean-text)",
              }}
            >
              <option value="">{loading ? "Loading roles…" : "Select current role"}</option>
              {roleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {(!loading && !error && roles.length === 0) && (
              <div role="note" style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
                No roles in catalog yet. Ask an admin to seed roles via the Admin console.
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="target_role">Target role</label>
            <select
              id="target_role"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              disabled={disabled || (roles.length === 0 && !error)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-color, rgba(0,0,0,0.12))",
                background: "var(--ocean-bg)",
                color: "var(--ocean-text)",
              }}
            >
              <option value="">{loading ? "Loading roles…" : "Select target role"}</option>
              {roleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
              Your readiness and gap breakdown are calculated against this target role.
            </div>
            {(!loading && !error && roles.length === 0) && (
              <div role="note" style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
                No roles in catalog yet. Admins can upload Role Navigator/Role Cards in Admin → Seed.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="theme-toggle"
              type="submit"
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {readiness != null && (
              <div style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
                Readiness: {(readiness * 100).toFixed(0)}%
                {overlap != null ? ` • Overlap: ${(overlap * 100).toFixed(0)}%` : ""}
              </div>
            )}
          </div>

          {message && (
            <div role="status" aria-live="polite" style={{ color: "var(--ocean-success)" }}>
              {message}
            </div>
          )}
          {error && (
            <div role="alert" style={{ color: "var(--ocean-error)" }}>
              {error}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
