import React, { useEffect, useState } from "react";
import { listSponsors, createSponsor, updateSponsor, deleteSponsor } from "../lib/api";

// PUBLIC_INTERFACE
export function Sponsors(): JSX.Element {
  /** Sponsors management for the current user's profile (RLS enforced). */
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");

  async function refresh() {
    const res = await listSponsors();
    if (res.error) setError(res.error);
    else setItems(res.data);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      await refresh();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const res = await createSponsor({ name: name.trim(), email: email || null, relationship: relationship || null });
    if (res.error) setError(res.error);
    setName("");
    setEmail("");
    setRelationship("");
    await refresh();
  }

  async function onUpdate(id: string, patch: any) {
    setError(null);
    const res = await updateSponsor(id, patch);
    if (res.error) setError(res.error);
    await refresh();
  }

  async function onDelete(id: string) {
    if (!window.confirm("Remove this sponsor?")) return;
    const res = await deleteSponsor(id);
    if (res.error) setError(res.error);
    await refresh();
  }

  return (
    <section>
      <h1 className="title">Sponsors</h1>
      <p className="description">Manage sponsors and mentors who support your career progression.</p>

      <form onSubmit={onCreate} style={{ display: "grid", gap: 8, maxWidth: 600, marginTop: 8 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="sp_name">Name</label>
          <input id="sp_name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="sp_email">Email (optional)</label>
          <input id="sp_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="sp_rel">Relationship (optional)</label>
          <input id="sp_rel" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
        </div>
        <button className="theme-toggle" type="submit">Add</button>
      </form>

      {loading ? (
        <div style={{ marginTop: 12 }}>Loading…</div>
      ) : error ? (
        <div role="alert" style={{ marginTop: 12, color: "var(--ocean-error)" }}>{error}</div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {items.length === 0 ? (
            <div style={{ color: "var(--ocean-secondary)" }}>No sponsors yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>Name</th>
                  <th style={{ width: "30%" }}>Email</th>
                  <th>Relationship</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <input
                        value={it.name || ""}
                        onChange={(e) => onUpdate(it.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={it.email || ""}
                        onChange={(e) => onUpdate(it.id, { email: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        value={it.relationship || ""}
                        onChange={(e) => onUpdate(it.id, { relationship: e.target.value || null })}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="theme-toggle"
                        onClick={() => onDelete(it.id)}
                        style={{ background: "var(--ocean-error)", color: "white" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

export default Sponsors;
