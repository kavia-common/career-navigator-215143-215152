import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./styles/theme.css";
import App from "./App";

// PUBLIC_INTERFACE
function bootstrap(): void {
  /** Bootstraps the React application and wires up the router. */
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    // eslint-disable-next-line no-console
    console.error("Root element #root not found.");
    return;
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}

bootstrap();
