import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../styles/theme.css";

/**
 * PUBLIC_INTERFACE
 * Login route providing email+password sign-in and sign-up with Supabase.
 * Includes optional OTP sign-in as a secondary tab, password reset link,
 * and update password flow when in PASSWORD_RECOVERY mode.
 */
export function Login(): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [tab, setTab] = useState<"signin" | "signup" | "otp" | "recover">("signin");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const siteUrl = process.env.REACT_APP_FRONTEND_URL || window.location.origin;
  const resetRedirect = useMemo(() => `${siteUrl}/auth/callback`, [siteUrl]);

  // Initialize UI mode from querystring
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "recover") {
      setTab("recover");
    }
  }, [searchParams]);

  // Session and PASSWORD_RECOVERY handling
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      if (user) navigate("/", { replace: true });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setTab("recover");
        setMessage("Please set a new password to complete recovery.");
        return;
      }
      if (session?.user) {
        // Post-login provisioning: ensure profile exists then navigate
        (async () => {
          try {
            const { ensureCurrentUserProfile } = await import("../lib/api");
            await ensureCurrentUserProfile();
          } catch {
            // ignore
          } finally {
            navigate("/", { replace: true });
          }
        })();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const friendlyError = (msg: string): string => {
    const lower = msg.toLowerCase();
    if (lower.includes("invalid login credentials")) return "Invalid email or password.";
    if (lower.includes("user already registered")) return "This email is already registered. Try signing in instead.";
    if (lower.includes("password should be")) return "Password is too weak. Use at least 6 characters.";
    return msg;
  };

  // Handlers
  const handleSignup = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setStatus("error");
        setMessage(friendlyError(error.message));
        return;
      }
      // If email confirmations are enabled, data.session will be null
      if (!data.session) {
        setStatus("success");
        setMessage("Check your email to confirm your account. Then you can sign in.");
      } else {
        // Signed in immediately
        setStatus("success");
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      setStatus("error");
      setMessage(friendlyError(err?.message || "Sign up failed"));
    }
  };

  const handleSignin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus("error");
        setMessage(friendlyError(error.message));
        return;
      }
      setStatus("success");
      navigate("/", { replace: true });
    } catch (err: any) {
      setStatus("error");
      setMessage(friendlyError(err?.message || "Sign in failed"));
    }
  };

  const handleReset = async (): Promise<void> => {
    setStatus("loading");
    setMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirect,
      });
      if (error) {
        setStatus("error");
        setMessage(friendlyError(error.message));
        return;
      }
      setStatus("success");
      setMessage("Password reset email sent. Check your inbox.");
    } catch (err: any) {
      setStatus("error");
      setMessage(friendlyError(err?.message || "Failed to send reset email"));
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmNew) {
      setMessage("Passwords do not match.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setStatus("error");
        setMessage(friendlyError(error.message));
        return;
      }
      if (data?.user) {
        setStatus("success");
        setMessage("Password updated. Redirecting…");
        setTimeout(() => navigate("/", { replace: true }), 600);
      } else {
        setStatus("success");
        setMessage("Password updated. You can now sign in.");
        setTab("signin");
      }
    } catch (err: any) {
      setStatus("error");
      setMessage(friendlyError(err?.message || "Failed to update password"));
    }
  };

  // Optional magic link (OTP) flow as secondary tab
  const handleOtp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: siteUrl },
      });
      if (error) {
        setStatus("error");
        setMessage(friendlyError(error.message));
        return;
      }
      setStatus("success");
      setMessage("Check your email for a sign-in link.");
    } catch (err: any) {
      setStatus("error");
      setMessage(friendlyError(err?.message || "Failed to send sign-in link"));
    }
  };

  const isLoading = status === "loading";

  const renderTabs = () => (
    <div role="tablist" aria-label="Authentication mode" className="mb-4" style={{ display: "flex", gap: 8 }}>
      <button
        role="tab"
        aria-selected={tab === "signin"}
        className={`theme-toggle ${tab === "signin" ? "active" : ""}`}
        onClick={() => setTab("signin")}
      >
        Sign in
      </button>
      <button
        role="tab"
        aria-selected={tab === "signup"}
        className={`theme-toggle ${tab === "signup" ? "active" : ""}`}
        onClick={() => setTab("signup")}
      >
        Create account
      </button>
      <button
        role="tab"
        aria-selected={tab === "otp"}
        className={`theme-toggle ${tab === "otp" ? "active" : ""}`}
        onClick={() => setTab("otp")}
      >
        Magic link
      </button>
      <button
        role="tab"
        aria-selected={tab === "recover"}
        className={`theme-toggle ${tab === "recover" ? "active" : ""}`}
        onClick={() => setTab("recover")}
      >
        Recover
      </button>
    </div>
  );

  const commonEmailField = (
    <>
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
        aria-label="Email address"
      />
    </>
  );

  const passwordField = (
    <>
      <label htmlFor="password" style={{ fontWeight: 600 }}>Password</label>
      <input
        id="password"
        className="input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        placeholder="••••••••"
        aria-label="Password"
      />
    </>
  );

  const signinView = (
    <form onSubmit={handleSignin} className="stack" noValidate aria-label="Sign in form">
      {commonEmailField}
      {passwordField}
      <button className="btn btn-primary" type="submit" disabled={isLoading} aria-busy={isLoading} aria-label="Sign in">
        {isLoading ? "Signing in…" : "Sign in"}
      </button>
      <button
        type="button"
        className="btn btn-link"
        onClick={handleReset}
        aria-label="Forgot password"
        style={{ alignSelf: "flex-start", color: "var(--color-secondary)" }}
      >
        Forgot password?
      </button>
    </form>
  );

  const signupView = (
    <form onSubmit={handleSignup} className="stack" noValidate aria-label="Create account form">
      {commonEmailField}
      {passwordField}
      <button className="btn btn-primary" type="submit" disabled={isLoading} aria-busy={isLoading} aria-label="Create account">
        {isLoading ? "Creating…" : "Create account"}
      </button>
      <p style={{ color: "var(--color-secondary)", fontSize: 14 }}>
        By creating an account, you agree to our terms and privacy policy.
      </p>
    </form>
  );

  const otpView = (
    <form onSubmit={handleOtp} className="stack" noValidate aria-label="Magic link form">
      {commonEmailField}
      <button className="btn btn-secondary" type="submit" disabled={isLoading} aria-busy={isLoading} aria-label="Send magic link">
        {isLoading ? "Sending…" : "Send magic link"}
      </button>
    </form>
  );

  const recoverView = (
    <form onSubmit={handleUpdatePassword} className="stack" noValidate aria-label="Update password form">
      <label htmlFor="new-password" style={{ fontWeight: 600 }}>New password</label>
      <input
        id="new-password"
        className="input"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        type="password"
        placeholder="New password"
        aria-label="New password"
      />
      <label htmlFor="confirm-password" style={{ fontWeight: 600 }}>Confirm new password</label>
      <input
        id="confirm-password"
        className="input"
        value={confirmNew}
        onChange={(e) => setConfirmNew(e.target.value)}
        type="password"
        placeholder="Confirm new password"
        aria-label="Confirm new password"
      />
      <button className="btn btn-primary" type="submit" disabled={isLoading} aria-busy={isLoading} aria-label="Update password">
        {isLoading ? "Updating…" : "Update password"}
      </button>
    </form>
  );

  return (
    <section className="container" aria-labelledby="login-title">
      <h1 id="login-title">Welcome</h1>
      <p className="mb-4" style={{ color: "var(--color-secondary)" }}>
        Sign in or create an account to continue.
      </p>

      <div className="card" role="form" aria-describedby="login-help" style={{ maxWidth: 520 }}>
        <p id="login-help" className="mb-4" style={{ color: "var(--color-secondary)" }}>
          Use your email and password. You can also use a magic link if enabled.
        </p>

        {renderTabs()}

        {tab === "signin" && signinView}
        {tab === "signup" && signupView}
        {tab === "otp" && otpView}
        {tab === "recover" && recoverView}

        {message && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 ${status === "error" ? "alert alert-error" : "alert alert-success"}`}
          >
            {message}
          </div>
        )}
      </div>
    </section>
  );
}

export default Login;
