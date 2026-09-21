import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(ROOT, "dist");
const INDEX_PATH = path.join(DIST_DIR, "index.html");

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error("dist/index.html not found; run vite build first");
  }
  let html = fs.readFileSync(INDEX_PATH, "utf8");
  if (!/<meta[^>]+http-equiv=["']content-security-policy/i.test(html)) {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
    html = html.replace(/<head[^>]*>/, (match) => `${match}\n    ${meta}`);
  }
  if (/\bunsafe-eval\b/.test(html)) {
    throw new Error("refusing to finalize page with unsafe-eval CSP");
  }
  fs.writeFileSync(INDEX_PATH, html, "utf8");
  fs.writeFileSync(path.join(DIST_DIR, "404.html"), html, "utf8");
  fs.writeFileSync(path.join(DIST_DIR, ".nojekyll"), "", "utf8");
  console.log("[finalize-pages] injected CSP, wrote 404.html and .nojekyll");
}

main();
