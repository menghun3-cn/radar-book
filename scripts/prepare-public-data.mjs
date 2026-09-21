import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJSON, writeJSONAtomic } from "./utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS_PATH = path.join(ROOT, "src", "data", "projects.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const PUBLIC_PROJECTS_PATH = path.join(PUBLIC_DIR, "projects.json");
const LLMS_TXT_PATH = path.join(PUBLIC_DIR, "llms.txt");
const RADAR_REPORT_PATH = path.join(ROOT, "src", "data", "radar.json");
const META_PATH = path.join(PUBLIC_DIR, "meta.json");

export const PUBLIC_FIELDS = [
  "id",
  "name",
  "author",
  "url",
  "category",
  "plainSummary",
  "tags",
  "stars",
  "forks",
  "openIssues",
  "license",
  "language",
  "createdAt",
  "lastCommitAt",
  "pushedAt",
  "metadataFetchedAt",
  "avatarUrl",
  "topics",
  "archived",
  "headSha",
  "sourceUrl",
  "sourcePath",
  "evidenceLines",
  "evidence",
  "verificationStatus",
  "pinned",
];

const SECRET_PATTERNS = [
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?END [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g,
];

const LOCAL_PATH_PATTERNS = [
  /(?:(?<![A-Za-z])[A-Za-z]:[\\/][^\s"',;)\]]+|(?:\/Users|\/home(?:\/[^/]+)?)[^\s"',;)\]]*)/g,
];

export function sanitizePublicText(value) {
  let text = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[redacted]");
  for (const pattern of LOCAL_PATH_PATTERNS) text = text.replace(pattern, "[redacted]");
  text = text.replace(/```[\s\S]*?```/g, " ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return text.trim();
}

function sanitizeValue(value) {
  if (typeof value === "string") return sanitizePublicText(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeValue(v)]));
  }
  return value;
}

export function preparePublicProject(project) {
  const entry = {};
  for (const key of PUBLIC_FIELDS) {
    if (key in project) entry[key] = project[key];
  }
  const pending = project.catalogStatus === "review-pending";
  if (pending) {
    entry.plainSummary = "待人工复核后展示。";
    entry.license = null;
  }
  return sanitizeValue(entry);
}

function main() {
  const projects = readJSON(PROJECTS_PATH);
  const publicProjects = projects.map(preparePublicProject);
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  writeJSONAtomic(PUBLIC_PROJECTS_PATH, publicProjects);

  let radarSummary = {};
  try { radarSummary = readJSON(RADAR_REPORT_PATH); } catch {}
  writeJSONAtomic(META_PATH, {
    status: radarSummary.status ?? "seed",
    lastRunAt: radarSummary.lastRunAt ?? null,
    totalProjects: publicProjects.length,
    projectsSha256: radarSummary.projectsSha256 ?? null,
  });
  const lines = [
    "# AI Tutorial Radar",
    "",
    "以下为已收录的 AI 教程仓库（自动扫描与人工核验）。",
    "",
  ];
  for (const project of publicProjects) {
    lines.push(`- [${project.name} (${project.author})](${project.url}): ${project.plainSummary ?? ""}`);
  }
  fs.writeFileSync(LLMS_TXT_PATH, lines.join("\n") + "\n", "utf8");

  const droppedKeys = new Set();
  for (const project of projects) {
    for (const key of Object.keys(project)) {
      if (!PUBLIC_FIELDS.includes(key)) droppedKeys.add(key);
    }
  }
  console.log(`[prepare-public-data] ${projects.length} projects -> public/projects.json`);
  console.log(`[prepare-public-data] dropped internal keys: ${[...droppedKeys].sort().join(", ") || "none"}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
