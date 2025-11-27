import React, { useEffect, useState } from "react";
import { supabase, getSupabaseEnv } from "../lib/supabaseClient";

/**
 * PUBLIC_INTERFACE
 * SupabaseHealth performs a lightweight connectivity check to Supabase.
 * - It verifies env configuration, attempts auth.getSession(), and performs a trivial select.
 * - Displays a small status badge/panel. In production, it renders nothing by default to stay unobtrusive.
 */
export default function SupabaseHealth(): JSX.Element | null {
  // Hide in production to avoid exposing internals; flip SHOW in dev
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const [status, setStatus] = useState<"idle" | "ok" | "error" | "checking">(
    "idle"
  );
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setStatus("checking");
      setMessage("Starting health check...");
      const { url, key } = getSupabaseEnv();
      if (!url || !key) {
        setStatus("error");
        setMessage(
          "Missing Supabase env. Ensure REACT_APP_SUPABASE_URL/KEY (or SUPABASE_URL/KEY) are set."
        );
        return;
      }
      try {
        // 1) Auth session check (does not require a logged-in user to succeed in connectivity)
        const sessRes = await supabase.auth.getSession();
        if (sessRes.error) {
          // log but don't immediately fail; continue to basic read to test anon connectivity
          // eslint-disable-next-line no-console
          console.warn("Health: auth.getSession error:", sessRes.error);
        }

        // 2) Make a tiny read from a public or harmless table.
        // Prefer "profiles" if present; fallback to a very cheap RPC-less call e.g. from('profiles').select('*').limit(1)
        const start = Date.now();
        const { data, error } = await supabase.from("profiles").select("id").limit(1);
        const ms = Date.now() - start;

        if (error) {
          // eslint-disable-next-line no-console
          console.error("Health: select from profiles failed:", error);
          setStatus("error");
          setMessage(`Error: ${error.message || "Failed to query profiles"} (${ms}ms)`);
          return;
        }
        setStatus("ok");
        setMessage(`Connected (${ms}ms). Rows: ${Array.isArray(data) ? data.length : 0}`);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error("Health check exception:", e);
        setStatus("error");
        setMessage(e?.message || "Unexpected error during health check");
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, []);

  const badgeClass =
    status === "ok" ? "chip chip-green" : status === "error" ? "chip chip-red" : "chip chip-amber";

  return (
    <section className="container" aria-labelledby="sb-health-title" style={{ marginTop: 16 }}>
      <h1 id="sb-health-title">Supabase Health</h1>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={badgeClass}>
          {status === "ok" ? "Connected" : status === "error" ? "Error" : "Checking..."}
        </span>
        <span style={{ color: "var(--color-secondary)" }}>{message}</span>
      </div>
      <p className="mt-2" style={{ fontSize: 12, color: "var(--color-secondary)" }}>
        Note: In production builds, this component returns null by default to stay unobtrusive.
      </p>
    </section>
  );
}
