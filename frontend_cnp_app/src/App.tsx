import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, Navigate } from "react-router-dom";
import "./App.css";
import "./styles/theme.css";
import {
  Dashboard,
  Graph,
  Compare,
  Profile,
  Evidence,
  DevPlan,
  Admin,
  Home,
  Login,
} from "./routes";
import { supabase } from "./lib/supabaseClient";

/**
 * Ocean Professional layout:
 * - Left navigation (persistent)
 * - Top header with brand and actions
 * - Main content area renders current route
 */

// Simple session shape for local state
interface SessionState {
  userId: string | null;
  email: string | null;
}

/** GuardedRoute props */
interface GuardedRouteProps {
  element: JSX.Element;
  requireAuth?: boolean;
  adminOnly?: boolean;
}

/** Role check stub for future expansion */
const useIsAdmin = (): boolean => {
  // In future, fetch from profile/claims. For now, false by default.
  return false;
};

// PUBLIC_INTERFACE
export function AuthGuard({ element, requireAuth = true, adminOnly = false }: GuardedRouteProps): JSX.Element {
  /** Guards a route based on Supabase auth session; supports admin-only stub. */
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const isAdmin = useIsAdmin();

  useEffect(() => {
    let mounted = true;

    // initial check
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const hasSession = !!data.session?.user;
      setAuthed(hasSession);
      setReady(true);
    });

    // subscribe to session changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session?.user);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!requireAuth) {
    return element;
  }

  if (!ready) {
    return <div className="container" aria-busy="true">Loading…</div>;
  }

  if (!authed) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return element;
}

// PUBLIC_INTERFACE
export default function App(): JSX.Element {
  /** Root application with Ocean Professional layout, nav, and guarded routes. */
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [session, setSession] = useState<SessionState>({ userId: null, email: null });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const themeLabel = useMemo(
    () => (theme === "light" ? "🌙 Dark" : "☀️ Light"),
    [theme]
  );

  const toggleTheme = (): void =>
    setTheme((t) => (t === "light" ? "dark" : "light"));

  // Supabase session listener
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user;
      setSession({ userId: u?.id ?? null, email: u?.email ?? null });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      const u = s?.user;
      setSession({ userId: u?.id ?? null, email: u?.email ?? null });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async (): Promise<void> => {
    await supabase.auth.signOut();
  };

  // Navigation entries
  const navItems = [
    { to: "/", label: "Dashboard" },
    { to: "/graph", label: "Graph" },
    { to: "/compare", label: "Compare" },
    { to: "/evidence", label: "Evidence" },
    { to: "/devplan", label: "Dev Plan" },
    { to: "/profile", label: "Profile" },
    { to: "/admin", label: "Admin" },
  ];

  return (
    <div className="App" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gridTemplateRows: "56px 1fr", minHeight: "100vh" }}>
      {/* Top header */}
      <header
        className="navbar"
        role="banner"
        aria-label="Top navigation"
        style={{ gridColumn: "1 / -1", gridRow: "1" }}
      >
        <div className="navbar__left">
          <Link className="brand" to="/">
            Career Navigator
          </Link>
        </div>
        <div className="navbar__center" />
        <div className="navbar__right" style={{ display: "flex", gap: 8 }}>
          {session.userId ? (
            <>
              <span style={{ color: "var(--ocean-secondary)", fontSize: 14 }}>{session.email}</span>
              <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
                {themeLabel}
              </button>
              <button className="theme-toggle" onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <>
              <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
                {themeLabel}
              </button>
              <Link className="navlink" to="/login">Sign in</Link>
            </>
          )}
        </div>
      </header>

      {/* Left nav */}
      <aside
        aria-label="Section navigation"
        style={{
          gridColumn: "1",
          gridRow: "2",
          background: "var(--ocean-surface)",
          borderRight: "1px solid rgba(0,0,0,0.06)",
          padding: "16px 12px",
        }}
      >
        <nav>
          {navItems.map((n) => (
            <div key={n.to} style={{ marginBottom: 4 }}>
              <NavLink to={n.to} end className={({ isActive }) => "navlink" + (isActive ? " active" : "")}>
                {n.label}
              </NavLink>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="container" role="main" style={{ gridColumn: "2", gridRow: "2" }}>
        <Routes>
          <Route path="/" element={<AuthGuard element={<Dashboard />} requireAuth />} />
          <Route path="/graph" element={<AuthGuard element={<Graph />} requireAuth />} />
          <Route path="/compare" element={<AuthGuard element={<Compare />} requireAuth />} />
          <Route path="/evidence" element={<AuthGuard element={<Evidence />} requireAuth />} />
          <Route path="/devplan" element={<AuthGuard element={<DevPlan />} requireAuth />} />
          <Route path="/profile" element={<AuthGuard element={<Profile />} requireAuth />} />
          <Route path="/admin" element={<AuthGuard element={<Admin />} requireAuth adminOnly />} />
          <Route path="/home" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
