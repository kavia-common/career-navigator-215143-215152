import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import "../styles/theme.css";

/**
 * PUBLIC_INTERFACE
 * Login route with magic link and password sign-in using Supabase; accessible and minimalist.
 */
export function Login(): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const navigate = useNavigate();

  const siteUrl = process.env.REACT_APP_FRONTEND_URL || window.location.origin;

  useEffect(() => {
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
        options: { emailRedirectTo: siteUrl },
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    <section className="container" aria-labelledby="login-title">
      <h1 id="login-title">Sign in</h1>
      <p className="mb-4" style={{ color: "var(--color-secondary)" }}>
        Use your email to receive a magic link or sign in with password.
      </p>

      <div className="card" role="form" aria-describedby="login-help" style={{ maxWidth: 480 }}>
        <p id="login-help" className="mb-4" style={{ color: "var(--color-secondary)" }}>
          We’ll email you a sign-in link. Alternatively, sign in with your password.
        </p>

        <form onSubmit={onMagic} className="stack" noValidate>
          <label htmlFor="email" style={{ fontWeight: 600 }}>Email</label>
          <input
            id="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="you@example.com"
            aria-required="true"
          />
          <button className="btn btn-primary" type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Sending..." : "Send magic link"}
          </button>
        </form>

        <hr className="mt-4 mb-4" style={{ border: 0, borderTop: "1px solid rgba(17,24,39,0.06)" }} />

        <form onSubmit={onPassword} className="stack" noValidate>
          <label htmlFor="password" style={{ fontWeight: 600 }}>Password</label>
          <input
            id="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
          />
          <button className="btn btn-secondary" type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Signing in..." : "Sign in with password"}
          </button>
        </form>

        {message && (
          <div
            role="status"
            aria-live="polite"
            className={status === "error" ? "alert alert-error mt-4" : "alert alert-success mt-4"}
          >
            {message}
          </div>
        )}
      </div>
    </section>
  );
}

export default Login;
