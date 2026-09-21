import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJSON } from "./utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(ROOT, "dist");
const SOURCE_PROJECTS_PATH = path.join(ROOT, "src", "data", "projects.json");
const DIST_PROJECTS_PATH = path.join(DIST_DIR, "projects.json");

const INTERNAL_KEY_PATTERNS = [
  "repoId",
  "metadataStatus",
  "metadataError",
  "sourceHash",
  "sourceVerification",
  "evidenceNote",
  "runtimeVerified",
  "catalogStatus",
  "summarySource",
  "licenseStatus",
  "sourceReviewedAt",
];

const SECRET_PATTERNS = [
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}/,
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/,
];

const REQUIRED_FIELDS = [
  "id",
  "name",
  "author",
  "url",
  "category",
  "plainSummary",
  "stars",
  "tags",
];

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function fail(message) {
  console.error(`[audit-build] FAIL: ${message}`);
  process.exitCode = 1;
}

export function findInternalFields(project) {
  const keys = Object.keys(project);
  return keys.filter((key) => INTERNAL_KEY_PATTERNS.includes(key));
}

export function findScannedSecrets(text) {
  const lower = String(text ?? "");
  return SECRET_PATTERNS.filter((pattern) => pattern.test(lower)).map((p) => p.source);
}

export function checkRequiredFields(project) {
  return REQUIRED_FIELDS.filter((field) => project[field] === undefined || project[field] === null || project[field] === "");
}

function main() {
  if (!fs.existsSync(DIST_PROJECTS_PATH)) {
    fail(`missing ${DIST_PROJECTS_PATH}`);
    return;
  }

  const sourceProjects = readJSON(SOURCE_PROJECTS_PATH);
  const distProjects = readJSON(DIST_PROJECTS_PATH);
  if (sourceProjects.length !== distProjects.length) {
    fail(`project count mismatch: source ${sourceProjects.length} vs dist ${distProjects.length}`);
  }

  for (const project of distProjects) {
    const internal = findInternalFields(project);
    if (internal.length) fail(`internal fields leaked in ${project.id}: ${internal.join(", ")}`);
    const missing = checkRequiredFields(project);
    if (missing.length) fail(`${project.id} missing required fields: ${missing.join(", ")}`);
    const summary = project.plainSummary ?? "";
    if (summary.includes("```") || /\b(def|function|import)\s/.test(summary)) {
      fail(`${project.id} summary looks like code`);
    }
  }

  const files = walk(DIST_DIR);
  const sourceMaps = files.filter((file) => file.endsWith(".map"));
  if (sourceMaps.length) fail(`source maps are published: ${sourceMaps.map((f) => path.relative(DIST_DIR, f)).join(", ")}`);

  const textExtensions = new Set([".html", ".js", ".css", ".json", ".txt", ".xml", ".md"]);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!textExtensions.has(ext)) continue;
    const text = fs.readFileSync(file, "utf8");
    const secrets = findScannedSecrets(text);
    if (secrets.length) fail(`secret pattern in ${path.relative(DIST_DIR, file)}: ${secrets.join(", ")}`);
    if (/(?:(?<![A-Za-z])[A-Za-z]:[\\/][^\s"']+|\/Users\/[^/\s]+)/.test(text)) {
      fail(`local path in ${path.relative(DIST_DIR, file)}`);
    }
  }

  const indexPath = path.join(DIST_DIR, "index.html");
  const indexHtml = fs.readFileSync(indexPath, "utf8");
  if (!indexHtml.includes('<div id="root"></div>')) fail("index.html missing #root");
  if (!/<script[^>]+type="module"/.test(indexHtml)) fail("index.html missing module script");
  if (!/content-security-policy/i.test(indexHtml)) fail("index.html missing CSP");
  if (/\bunsafe-eval\b/.test(indexHtml)) fail("CSP allows unsafe-eval");

  const bannedDirs = ["radar", "receipts", "scripts", ".github"];
  for (const dir of bannedDirs) {
    const full = path.join(DIST_DIR, dir);
    if (fs.existsSync(full)) fail(`internal directory published: ${dir}`);
  }

  console.log(`[audit-build] OK: ${distProjects.length} projects, ${files.length} files, no internal fields, no secrets, no source maps`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
