import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@workspace/ui/globals.css";
import { ThemeProvider } from "./components/theme-provider.js";
import { App } from "./App.js";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
