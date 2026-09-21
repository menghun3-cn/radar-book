import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJSONAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2) + "\n", "utf8");
  try {
    fs.renameSync(tmpPath, filePath);
  } catch {
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tmpPath, filePath);
  }
}

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function nowISO() {
  return new Date().toISOString();
}

export function decodeBase64(content) {
  const cleaned = content.replace(/\s/g, "");
  return Buffer.from(cleaned, "base64").toString("utf8");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeSecret(value) {
  return String(value ?? "").trim();
}
