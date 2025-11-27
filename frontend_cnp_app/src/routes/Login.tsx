import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Minimal email magic link sign-in to exercise Supabase auth flow.
 * In production, consider OAuth providers and stronger UX.
 */

// PUBLIC_INTERFACE
export function Login(): JSX.Element {
  /** Public login route that sends a magic link. */
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const siteUrl = process.env.REACT_APP_FRONTEND_URL || window.location.origin;

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: siteUrl, // honor environment
        },
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("sent");
      setMessage("Check your email for a sign-in link.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <section>
      <h1 className="title">Sign in</h1>
      <p className="description">Use your email to receive a magic sign-in link.</p>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder="you@example.com"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-color, rgba(0,0,0,0.12))",
          }}
        />
        <button className="theme-toggle" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending..." : "Send magic link"}
        </button>
        {message && (
          <div role="status" aria-live="polite" style={{ color: status === "error" ? "var(--ocean-error)" : "var(--ocean-secondary)" }}>
            {message}
          </div>
        )}
      </form>
    </section>
  );
}
