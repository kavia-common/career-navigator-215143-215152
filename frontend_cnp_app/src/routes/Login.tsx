import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

/**
 * Email magic link and optional password sign-in to exercise Supabase auth flow.
 * In production, consider OAuth providers and stronger UX.
 */

// PUBLIC_INTERFACE
export function Login(): JSX.Element {
  /** Public login route that supports magic link and password sign-in. */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const navigate = useNavigate();

  const siteUrl = process.env.REACT_APP_FRONTEND_URL || window.location.origin;

  useEffect(() => {
    // if already logged in, redirect to dashboard
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.user) navigate("/", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.user) navigate("/", { replace: true });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const onMagic = async (e: React.FormEvent): Promise<void> => {
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

  const onPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("idle");
      navigate("/", { replace: true });
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <section>
      <h1 className="title">Sign in</h1>
      <p className="description">Use your email to receive a magic link or sign in with password.</p>

      <form onSubmit={onMagic} style={{ display: "grid", gap: 8, maxWidth: 360, marginBottom: 16 }}>
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
      </form>

      <form onSubmit={onPassword} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="••••••••"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-color, rgba(0,0,0,0.12))",
          }}
        />
        <button className="theme-toggle" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Signing in..." : "Sign in with password"}
        </button>
      </form>

      {message && (
        <div role="status" aria-live="polite" style={{ marginTop: 10, color: status === "error" ? "var(--ocean-error)" : "var(--ocean-secondary)" }}>
          {message}
        </div>
      )}
    </section>
  );
}
