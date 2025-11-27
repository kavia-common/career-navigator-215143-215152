import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import "./App.css";
import { Home } from "./routes";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";

// PUBLIC_INTERFACE
export default function App(): JSX.Element {
  /** Root application shell with basic nav and routing. */
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const themeLabel = useMemo(
    () => (theme === "light" ? "🌙 Dark" : "☀️ Light"),
    [theme]
  );

  const toggleTheme = (): void =>
    setTheme((t) => (t === "light" ? "dark" : "light"));

  // quick smoke to ensure supabase client exists (no network call)
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug("Supabase client initialized:", !!supabase);
  }, []);

  return (
    <div className="App">
      <header className="navbar" role="banner" aria-label="Top navigation">
        <div className="navbar__left">
          <Link className="brand" to="/">
            Career Navigator
          </Link>
        </div>
        <nav className="navbar__center" aria-label="Primary">
          <NavLink to="/" className="navlink">
            Home
          </NavLink>
        </nav>
        <div className="navbar__right">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {themeLabel}
          </button>
        </div>
      </header>

      <main className="container" role="main">
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </main>

      <footer className="footer" role="contentinfo">
        <small>&copy; {new Date().getFullYear()} Career Navigator</small>
      </footer>
    </div>
  );
}
