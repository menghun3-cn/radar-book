import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import type { InitialPageData } from "./types";
import "./styles.css";

function readInitialData(): InitialPageData | null {
  if (typeof document === "undefined") return null;
  const node = document.getElementById("initial-projects");
  if (!node?.textContent) return null;
  try {
    const data = JSON.parse(node.textContent) as InitialPageData;
    if (data && Array.isArray(data.projects) && data.copy) return data;
  } catch {
    // Fall back to fetching public data at runtime.
  }
  return null;
}

const initialData = readInitialData();
const container = document.getElementById("root")!;
const app = (
  <React.StrictMode>
    <App initialData={initialData ?? undefined} />
  </React.StrictMode>
);

if (initialData) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
