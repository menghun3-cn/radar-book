import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJSON } from "./utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_CONTENT_PATH = path.join(ROOT, "src", "data", "site-content.json");

export const LOCALES = ["zh", "en", "ja", "ko"];

const CONTENT = readJSON(SITE_CONTENT_PATH);

export function localeMeta(locale) {
  return CONTENT.localeMeta[locale] ?? CONTENT.localeMeta.zh;
}

export function copyFor(locale) {
  return CONTENT.copy[locale] ?? CONTENT.copy.zh;
}

export function categoryLabelFor(category, locale) {
  return CONTENT.categoryLabels[category]?.[locale] ?? category;
}

export function allLocaleMeta() {
  return CONTENT.locales.map((locale) => ({ locale, ...localeMeta(locale) }));
}

export function projectSummaryFor(project, locale) {
  if (!project) return "";
  const suffix = { zh: "", en: "En", ja: "Ja", ko: "Ko" }[locale] ?? "";
  return project[`plainSummary${suffix}`] || project.plainSummary || "";
}

export function categoryPageSelections(taxonomy) {
  return (taxonomy?.categories ?? [])
    .filter((item) => item.id !== "all")
    .map((item) => item.id);
}

export function projectRouteSlug(project) {
  return String(project.id).toLowerCase().replaceAll("/", "--");
}

export function localizedPagePath(currentPath, targetLocale) {
  const stripped = currentPath.replace(/^\/(en|ja|ko)\//, "/");
  const base = stripped === "/" ? "/" : stripped;
  return targetLocale === "zh" ? base : `/${targetLocale}${base}`;
}
