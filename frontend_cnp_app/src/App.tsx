import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link, NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
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
  CompetencyDetail,
} from "./routes";
import { Sponsors, Notifications } from "./routes";
import { supabase } from "./lib/supabaseClient";

/**
 * Ocean Professional layout:
 * - Left navigation (collapsible)
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
  const [navOpen, setNavOpen] = useState<boolean>(true);
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
  const location = useLocation();
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Close menus on route change
  useEffect(() => {
    setUserMenuOpen(false);
    // Collapse nav on small screens after navigation
    if (window.innerWidth < 900) setNavOpen(false);
  }, [location.pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const themeLabel = useMemo(
    () => (theme === "light" ? "🌙 Dark" : "☀️ Light"),
    [theme]
  );

  const toggleTheme = (): void =>
    setTheme((t) => (t === "light" ? "dark" : "light"));

  // Supabase session listener with PASSWORD_RECOVERY handling
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user;
      setSession({ userId: u?.id ?? null, email: u?.email ?? null });
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      const u = s?.user;
      setSession({ userId: u?.id ?? null, email: u?.email ?? null });

      if (event === "PASSWORD_RECOVERY") {
        window.history.pushState({}, "", "/login?mode=recover");
      }

      // On sign-in or token refresh, ensure profile row exists
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        try {
          const { ensureCurrentUserProfile } = await import("./lib/api");
          await ensureCurrentUserProfile();
          // Optional: warm read of profile
          await supabase.from("profiles").select("id").limit(1);
        } catch {
          // ignore
        }
      }
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
    { to: "/sponsors", label: "Sponsors" },
    { to: "/notifications", label: "Notifications" },
    { to: "/profile", label: "Profile" },
    { to: "/admin", label: "Admin" },
  ];

  const gridCols = navOpen ? "260px 1fr" : "0px 1fr";

  return (
    <div className="App" style={{ display: "grid", gridTemplateColumns: gridCols, gridTemplateRows: "56px 1fr", minHeight: "100vh" }}>
      {/* Top header */}
      <header
        className="navbar"
        role="banner"
        aria-label="Top navigation"
        style={{ gridColumn: "1 / -1", gridRow: "1" }}
      >
        <div className="navbar__left" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="theme-toggle"
            aria-label={navOpen ? "Collapse navigation" : "Expand navigation"}
            onClick={() => setNavOpen((v) => !v)}
            style={{ padding: "6px 10px" }}
          >
            {navOpen ? "☰" : "☷"}
          </button>
          <Link className="brand" to="/">
            Career Navigator
          </Link>
        </div>
        <div className="navbar__center" />
        <div className="navbar__right" style={{ display: "flex", gap: 8, position: "relative" }} ref={userMenuRef}>
          <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
            {themeLabel}
          </button>
          {session.userId ? (
            <>
              <button className="theme-toggle" onClick={() => setUserMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={userMenuOpen}>
                {session.email ?? "Account"} ⌄
              </button>
              {userMenuOpen && (
                <div role="menu" style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  background: "var(--ocean-bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  boxShadow: "var(--shadow-1)",
                  minWidth: 180,
                  padding: 6,
                  zIndex: 20
                }}>
                  <Link className="navlink" to="/profile" role="menuitem">Profile</Link>
                  <div>
                    <button className="theme-toggle" onClick={handleSignOut} style={{ width: "100%", marginTop: 6 }}>
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Link className="navlink" to="/login">Sign in</Link>
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
          padding: navOpen ? "16px 12px" : "0px",
          overflow: "hidden",
          transition: "all 0.2s ease",
        }}
      >
        {navOpen && (
          <nav>
            {navItems.map((n) => (
              <div key={n.to} style={{ marginBottom: 4 }}>
                <NavLink to={n.to} end className={({ isActive }) => "navlink" + (isActive ? " active" : "")}>
                  {n.label}
                </NavLink>
              </div>
            ))}
          </nav>
        )}
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
          <Route path="/competency" element={<AuthGuard element={<CompetencyDetail />} requireAuth />} />
          <Route path="/sponsors" element={<AuthGuard element={<Sponsors />} requireAuth />} />
          <Route path="/notifications" element={<AuthGuard element={<Notifications />} requireAuth />} />
          <Route path="/admin" element={<AuthGuard element={<Admin />} requireAuth adminOnly />} />
          <Route path="/home" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
