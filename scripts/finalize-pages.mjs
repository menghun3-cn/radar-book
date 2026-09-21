import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(ROOT, "dist");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function cspFor(html) {
  const hashes = [];
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const tag = match[0];
    if (!/<script[^>]*id=["']initial-projects["']/i.test(tag)) {
      throw new Error("refusing to finalize page with executable inline script");
    }
    const hash = crypto.createHash("sha256").update(match[1]).digest("base64");
    hashes.push(`'sha256-${hash}'`);
  }
  return [
    "default-src 'self'",
    `script-src 'self'${hashes.length ? ` ${hashes.join(" ")}` : ""}`,
    "style-src 'self'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function main() {
  const htmlFiles = walk(DIST_DIR).filter((file) => file.endsWith(".html"));
  if (htmlFiles.length === 0) throw new Error("no html files found; run vite build and build-static-site first");

  let finalized = 0;
  for (const file of htmlFiles) {
    let html = fs.readFileSync(file, "utf8");
    if (/\bunsafe-eval\b/.test(html)) {
      throw new Error(`refusing to finalize ${path.relative(DIST_DIR, file)} with unsafe-eval CSP`);
    }
    const csp = cspFor(html);
    if (!/<meta[^>]+http-equiv=["']content-security-policy/i.test(html)) {
      const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
      html = html.replace(/<head[^>]*>/, (match) => `${match}\n    ${meta}`);
    }
    fs.writeFileSync(file, html, "utf8");
    finalized += 1;
  }

  const indexHtml = fs.readFileSync(path.join(DIST_DIR, "index.html"), "utf8");
  fs.writeFileSync(path.join(DIST_DIR, "404.html"), indexHtml, "utf8");
  fs.writeFileSync(path.join(DIST_DIR, ".nojekyll"), "", "utf8");
  console.log(`[finalize-pages] injected CSP into ${finalized} html files, wrote 404.html and .nojekyll`);
}

main();
