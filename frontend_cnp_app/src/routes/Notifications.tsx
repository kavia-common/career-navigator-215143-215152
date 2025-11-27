import React, { useEffect, useState } from "react";
import { createNotification, listNotifications, markNotificationDelivered } from "../lib/api";

/**
 * PUBLIC_INTERFACE
 * Notifications page: list/create and mark delivered for current user's notifications.
 * RLS ensures only own rows appear.
 */
export function Notifications(): JSX.Element {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function refresh() {
    const res = await listNotifications();
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
    return () => {
      active = false;
    };
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await createNotification({ title, body: body || null, kind: 'note' });
    if (res.error) setError(res.error);
    setTitle("");
    setBody("");
    await refresh();
  }

  async function onMark(id: string) {
    const res = await markNotificationDelivered(id);
    if (res.error) setError(res.error);
    await refresh();
  }

  return (
    <section>
      <h1 className="title">Notifications</h1>
      <p className="description">View and manage your notifications.</p>

      <form onSubmit={onCreate} style={{ display: "grid", gap: 8, maxWidth: 600, marginTop: 8 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="nt_title">Title</label>
          <input id="nt_title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="nt_body">Body (optional)</label>
          <textarea id="nt_body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </div>
        <button className="theme-toggle" type="submit">Create</button>
      </form>

      {loading ? (
        <div style={{ marginTop: 12 }}>Loading…</div>
      ) : error ? (
        <div role="alert" style={{ marginTop: 12, color: "var(--ocean-error)" }}>{error}</div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {items.length === 0 ? (
            <div style={{ color: "var(--ocean-secondary)" }}>No notifications.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {items.map((it) => (
                <li key={it.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{it.title}</div>
                      {it.body && <div style={{ color: "var(--ocean-secondary)", marginTop: 4 }}>{it.body}</div>}
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                        {it.created_at ? new Date(it.created_at).toLocaleString() : ""}
                        {it.delivered_at ? ` • delivered ${new Date(it.delivered_at).toLocaleString()}` : ""}
                      </div>
                    </div>
                    {!it.delivered_at && (
                      <button className="theme-toggle" onClick={() => onMark(it.id)}>Mark delivered</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default Notifications;
