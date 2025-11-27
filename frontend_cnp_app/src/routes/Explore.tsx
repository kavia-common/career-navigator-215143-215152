import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import { Role } from "../lib/types";
import { listRoles } from "../lib/api";

// PUBLIC_INTERFACE
export function Explore(): JSX.Element {
  /**
   * Public Explore page:
   * - Does not require auth
   * - Select current role from roles table
   * - Shows ranked adjacency table (role_adjacency) descending by weight/overlap
   * - Click target role to navigate to public gap details page
   */
  const [roles, setRoles] = useState<Role[]>([]);
  const [sourceRole, setSourceRole] = useState<string>("");
  const [adjacent, setAdjacent] = useState<Array<{ target_role: string; target_name: string; weight: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await listRoles();
      if (!mounted) return;
      if (!res.error) setRoles(res.data);
    })();
    return () => { mounted = false; };
  }, []);

  const roleOptions = useMemo(
    () =>
      roles.map((r) => ({
        value: r.code || r.id || "",
        label: `${r.code || r.id} — ${r.name}`,
      })),
    [roles]
  );

  useEffect(() => {
    if (!sourceRole) {
      setAdjacent([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        // role_adjacency schema assumed: source_role, target_role, weight
        // roles: code,name
        const { data, error } = await supabase
          .from("role_adjacency")
          .select("source_role,target_role,weight, roles:target_role ( name )")
          .eq("source_role", sourceRole)
          .order("weight", { ascending: false });
        if (error) throw error;
        if (!active) return;
        const mapped = (data || []).map((r: any) => ({
          target_role: r.target_role,
          target_name: r.roles?.name || r.target_role,
          weight: Number(r.weight ?? 0),
        }));
        setAdjacent(mapped);
      } catch (e: any) {
        setErr(e?.message || "Failed to load adjacency");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [sourceRole]);

  return (
    <section className="container" aria-labelledby="explore-title">
      <h1 id="explore-title">Explore Roles</h1>
      <p className="mb-4" style={{ color: "var(--color-secondary)" }}>
        Select your current role to explore adjacent roles and compare competency gaps. No sign-in required.
      </p>

      <div className="card" style={{ maxWidth: 720 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="currentRole" style={{ fontWeight: 600 }}>
            Current role
          </label>
          <select
            id="currentRole"
            value={sourceRole}
            onChange={(e) => setSourceRole(e.target.value)}
            className="input"
          >
            <option value="">{roles.length === 0 ? "No roles available" : "Select current role…"}</option>
            {roleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {roles.length === 0 && (
            <div role="note" style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
              No roles in catalog yet. Site admins can seed roles in the Admin console.
            </div>
          )}
        </div>
      </div>

      <div className="card mt-4" role="region" aria-label="Adjacent roles ranked by overlap">
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Adjacent roles</div>
          {loading ? (
            <div style={{ color: "var(--color-secondary)" }}>Loading…</div>
          ) : err ? (
            <div role="alert" style={{ color: "var(--ocean-error)" }}>
              {err}
            </div>
          ) : adjacent.length === 0 ? (
            <div style={{ color: "var(--color-secondary)" }}>
              {sourceRole ? "No adjacent roles found." : "Select a current role to see adjacency."}
            </div>
          ) : (
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Target role</th>
                  <th style={{ textAlign: "right" }}>Overlap %</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {adjacent.map((a) => (
                  <tr key={a.target_role}>
                    <td style={{ textAlign: "left" }}>{a.target_name}</td>
                    <td style={{ textAlign: "right" }}>{Math.round((a.weight ?? 0) * 100)}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="navlink" to={`/explore/${encodeURIComponent(sourceRole)}/gaps/${encodeURIComponent(a.target_role)}`}>
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

export default Explore;
