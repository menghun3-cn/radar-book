import { renderToString } from "react-dom/server";
import App from "./App";
import type { InitialPageData } from "./types";

export function renderApp(initialData: InitialPageData): string {
  return renderToString(<App initialData={initialData} />);
}
