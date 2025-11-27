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
import { supabase, getSupabaseEnv } from "./lib/supabaseClient";

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

// App-scoped admin state
interface AppAuthState extends SessionState {
  isAdmin: boolean | null; // null = unknown/pending
}

/** GuardedRoute props */
interface GuardedRouteProps {
  element: JSX.Element;
  requireAuth?: boolean;
  adminOnly?: boolean;
}

/**
 * PUBLIC_INTERFACE
 * useIsAdmin hook derives the isAdmin state from AppAuthState propagated via window-scoped singleton.
 * We avoid React Context to minimize invasive changes; this module-scope store is sufficient for this task.
 */
let __appAuthState: AppAuthState = { userId: null, email: null, isAdmin: null };
const listeners = new Set<() => void>();
function setAppAuthState(next: Partial<AppAuthState>) {
  __appAuthState = { ...__appAuthState, ...next };
  listeners.forEach((cb) => cb());
}
function useIsAdmin(): boolean | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((t) => t + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
      // Explicitly return void to satisfy EffectCallback typing
    };
  }, []);
  return __appAuthState.isAdmin;
}

// PUBLIC_INTERFACE
export function AuthGuard({ element, requireAuth = true, adminOnly = false }: GuardedRouteProps): JSX.Element {
  /**
   * Guards a route based on Supabase auth session; supports admin-only using derived isAdmin state.
   * Adds timeouts and graceful fallbacks to prevent infinite loading or redirect loops.
   */
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [timeoutFired, setTimeoutFired] = useState(false);
  // Always declare hooks at top-level (rules-of-hooks)
  const [adminTimeout, setAdminTimeout] = useState(false);
  const isAdmin = useIsAdmin();

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Bound initial readiness with a timeout (5s)
    timer = setTimeout(() => {
      if (!mounted) return;
      setTimeoutFired(true);
      setReady(true); // force ready to avoid infinite spinner
    }, 5000);

    // initial check
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const hasSession = !!data.session?.user;
      setAuthed(hasSession);
      setReady(true);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });

    // subscribe to session changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session?.user);
    });

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  // Bounded admin-only wait (5s). Run this effect unconditionally; it only matters when adminOnly is true.
  useEffect(() => {
    if (!adminOnly) {
      setAdminTimeout(false);
      return;
    }
    const t = setTimeout(() => setAdminTimeout(true), 5000);
    return () => clearTimeout(t);
  }, [adminOnly]);

  if (!requireAuth) {
    return element;
  }

  // If not ready, show short bounded loading
  if (!ready) {
    return <div className="container" aria-busy="true">Loading…</div>;
  }

  // After timeout: degrade gracefully - render app shell with notice instead of looping forever
  if (!authed) {
    if (timeoutFired) {
      return (
        <div className="container">
          <div role="alert" className="alert alert-error" style={{ marginBottom: 12 }}>
            You are not signed in. Please sign in to continue.
          </div>
          <Navigate to="/login" replace />
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }

  if (adminOnly) {
    if (isAdmin === null && !adminTimeout) {
      // Wait until admin state is resolved to avoid flicker, but bounded
      return <div className="container" aria-busy="true">Checking permissions…</div>;
    }
    if (!isAdmin) {
      return <Navigate to="/" replace />;
    }
  }

  return element;
}

// PUBLIC_INTERFACE
export default function App(): JSX.Element {
  /** Root application with Ocean Professional layout, nav, and guarded routes. */
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [session, setSession] = useState<SessionState>({ userId: null, email: null });
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [navOpen, setNavOpen] = useState<boolean>(true);
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
  const [envIssue, setEnvIssue] = useState<string | null>(null);
  const location = useLocation();
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Check env configuration to surface clear errors early but do not block UI
  useEffect(() => {
    const { url, key } = getSupabaseEnv();
    if (!url || !key) {
      setEnvIssue("Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY.");
    } else {
      setEnvIssue(null);
    }
  }, []);

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

  // Resolve isAdmin from either user_metadata.is_admin or existing admin check in Admin.tsx (admin_users table).
  const resolveIsAdmin = async (): Promise<boolean> => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const meta = (user?.user_metadata || {}) as any;
      if (typeof meta?.is_admin === "boolean") {
        return !!meta.is_admin;
      }
      // Fallback: query admin_users (same logic used in Admin.tsx)
      try {
        const email = user?.email || "";
        const userId = user?.id || "";
        const q1 = await supabase.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
        if (q1.data?.user_id) return true;
        const q2 = await supabase.from("admin_users").select("email").eq("email", email).maybeSingle();
        if (q2.data?.email) return true;
      } catch {
        // ignore table absence / RLS errors - treat as non-admin
      }
      return false;
    } catch {
      return false;
    }
  };

  // Supabase session listener with PASSWORD_RECOVERY handling and admin flag resolution
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const u = data.session?.user;
      const next = { userId: u?.id ?? null, email: u?.email ?? null };
      setSession(next);
      setAppAuthState(next);
      if (u?.id) {
        setIsAdmin(null); // reset while resolving
        // Resolve admin with a bounded timeout
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const admin = await Promise.race<boolean>([
            resolveIsAdmin(),
            new Promise<boolean>((resolve) => {
              const id = setTimeout(() => {
                clearTimeout(id);
                resolve(false);
              }, 5000);
            }),
          ]);
          if (!mounted) return;
          setIsAdmin(admin);
          setAppAuthState({ isAdmin: admin });
        } finally {
          clearTimeout(timer);
        }
      } else {
        setIsAdmin(null);
        setAppAuthState({ isAdmin: null });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      const u = s?.user;
      const next = { userId: u?.id ?? null, email: u?.email ?? null };
      setSession(next);
      setAppAuthState(next);

      if (event === "PASSWORD_RECOVERY") {
        window.history.pushState({}, "", "/login?mode=recover");
      }

      // On sign-in or token refresh, ensure profile row exists (non-blocking and best-effort)
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        try {
          const { ensureCurrentUserProfile } = await import("./lib/api");
          // Do not await indefinitely; race with timeout
          await Promise.race([
            ensureCurrentUserProfile(),
            new Promise((resolve) => setTimeout(resolve, 5000)),
          ]);
          // Optional: warm read of profile (non-blocking)
          (async () => {
            try {
              await supabase.from("profiles").select("id").limit(1);
            } catch {
              // ignore
            }
          })();
        } catch {
          // ignore
        }
      }

      // Resolve admin after auth state updates (bounded)
      if (u?.id) {
        setIsAdmin(null);
        const admin = await Promise.race<boolean>([
          resolveIsAdmin(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
        ]);
        setIsAdmin(admin);
        setAppAuthState({ isAdmin: admin });
      } else {
        setIsAdmin(null);
        setAppAuthState({ isAdmin: null });
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

  // Navigation entries (conditionally include Admin)
  const baseNavItems = [
    { to: "/", label: "Dashboard" },
    { to: "/graph", label: "Graph" },
    { to: "/compare", label: "Compare" },
    { to: "/evidence", label: "Evidence" },
    { to: "/devplan", label: "Dev Plan" },
    { to: "/sponsors", label: "Sponsors" },
    { to: "/notifications", label: "Notifications" },
    { to: "/profile", label: "Profile" },
  ];
  const navItems = isAdmin ? [...baseNavItems, { to: "/admin", label: "Admin" }] : baseNavItems;

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
        <div className="navbar__right" style={{ display: "flex", gap: 8, position: "relative", alignItems: "center" }} ref={userMenuRef}>
          {/* Env issue banner in header for visibility */}
          {envIssue && (
            <span role="status" style={{ color: "#B45309", background: "#FEF3C7", border: "1px solid #F59E0B", padding: "4px 8px", borderRadius: 6 }}>
              {envIssue}
            </span>
          )}
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
          {/* Only register Admin route when admin; otherwise, omit so it's unreachable */}
          {isAdmin ? (
            <Route path="/admin" element={<AuthGuard element={<Admin />} requireAuth adminOnly />} />
          ) : null}
          <Route path="/home" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
