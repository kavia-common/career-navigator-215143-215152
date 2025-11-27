import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { createEvidence, deleteEvidence, listCompetencies, listEvidence, uploadEvidenceFile } from "../lib/api";
import type { Competency, Evidence as EvidenceRow, UUID } from "../lib/types";

// PUBLIC_INTERFACE
export function Evidence(): JSX.Element {
  /**
   * Evidence Vault:
   * - Upload file to Supabase Storage 'evidence' bucket at {user_id}/<uuid>.* (RLS folder policy)
   * - Tag upload to competency (and optional skill placeholder)
   * - Persist row in evidence table
   * - List current user's evidence with signed URLs and delete option
   */
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [items, setItems] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [competencyId, setCompetencyId] = useState<string>("");

  const competencyOptions = useMemo(
    () => competencies.map((c) => ({ value: c.id, label: c.name })),
    [competencies]
  );

  const refresh = async (): Promise<void> => {
    const res = await listEvidence();
    if (!res.error && res.data) setItems(res.data);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [comps, ev] = await Promise.all([listCompetencies(), listEvidence()]);
        if (!active) return;
        if (comps.error) throw new Error(comps.error);
        setCompetencies(comps.data || []);
        if (!ev.error && ev.data) setItems(ev.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load evidence.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!file && !title.trim()) {
      setError("Please provide a file and title.");
      return;
    }

    setUploading(true);
    try {
      // Require user id
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id as UUID | undefined;
      if (!uid) throw new Error("You must be signed in to upload.");

      let storage_path: string | undefined = undefined;
      if (file) {
        const up = await uploadEvidenceFile(uid, file);
        if (up.error) throw new Error(up.error);
        storage_path = up.data?.path;
      }

      const created = await createEvidence({
        title: title || (file?.name ?? "Untitled"),
        description: description || undefined,
        competency_id: competencyId || undefined,
        storage_path,
      });
      if (created.error) throw new Error(created.error);

      // Reset form
      setFile(null);
      setTitle("");
      setDescription("");
      setCompetencyId("");

      // Refresh list
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload evidence.");
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: UUID): Promise<void> => {
    if (!window.confirm("Delete this evidence? This cannot be undone.")) return;
    const res = await deleteEvidence(id);
    if (res.error) {
      setError(res.error);
    } else {
      await refresh();
    }
  };

  return (
    <section>
      <h1 className="title">Evidence</h1>
      <p className="description">Collect and manage readiness evidence aligned to your competencies.</p>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "1fr",
          marginTop: 8,
          maxWidth: 720,
        }}
      >
        <form onSubmit={onSubmit}
              style={{ display: "grid", gap: 10, padding: 12, border: "1px solid var(--border-color)", borderRadius: 12, background: "var(--ocean-surface)" }}>
          <div style={{ fontWeight: 600 }}>Add Evidence</div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="evidence_file">File</label>
            <input
              id="evidence_file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="evidence_title">Title</label>
            <input
              id="evidence_title"
              type="text"
              placeholder="e.g., Architecture Review Deck"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={uploading}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-color, rgba(0,0,0,0.12))",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="evidence_comp">Linked competency (optional)</label>
            <select
              id="evidence_comp"
              value={competencyId}
              onChange={(e) => setCompetencyId(e.target.value)}
              disabled={uploading}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-color, rgba(0,0,0,0.12))",
              }}
            >
              <option value="">— None —</option>
              {competencyOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="evidence_desc">Description (optional)</label>
            <textarea
              id="evidence_desc"
              placeholder="Brief context for this artifact"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={uploading}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-color, rgba(0,0,0,0.12))",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="theme-toggle" type="submit" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
            {loading && <span style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>Loading…</span>}
          </div>

          {error && <div role="alert" style={{ color: "var(--ocean-error)" }}>{error}</div>}
        </form>

        <div style={{ padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Your Evidence</div>
          {items.length === 0 ? (
            <div style={{ color: "var(--ocean-secondary)" }}>No evidence yet. Upload your first artifact above.</div>
          ) : (
            <div role="table" aria-label="Evidence list" style={{ width: "100%", overflowX: "auto" }}>
              <div role="rowgroup">
                <div role="row" style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px 80px", fontWeight: 600, padding: "8px 6px", borderBottom: "1px solid var(--border-color)" }}>
                  <div role="columnheader">Title & Description</div>
                  <div role="columnheader">Competency</div>
                  <div role="columnheader">Artifact</div>
                  <div role="columnheader" style={{ textAlign: "right" }}>Actions</div>
                </div>
              </div>
              <div role="rowgroup">
                {items.map((it) => {
                  const compName = competencies.find(c => c.id === it.competency_id)?.name || "—";
                  const link = it.signed_url || "#";
                  const hasFile = !!it.storage_path;
                  return (
                    <div key={it.id} role="row" style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px 80px", padding: "10px 6px", borderBottom: "1px solid var(--border-color)" }}>
                      <div role="cell">
                        <div style={{ fontWeight: 500 }}>{it.title}</div>
                        {it.description && <div style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>{it.description}</div>}
                      </div>
                      <div role="cell" style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ fontSize: 12 }}>{compName}</span>
                      </div>
                      <div role="cell" style={{ display: "flex", alignItems: "center" }}>
                        {hasFile ? (
                          <a className="navlink" href={link} target="_blank" rel="noreferrer">Open</a>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>—</span>
                        )}
                      </div>
                      <div role="cell" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <button className="theme-toggle" onClick={() => onDelete(it.id)} style={{ background: "var(--ocean-error)", color: "white" }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
