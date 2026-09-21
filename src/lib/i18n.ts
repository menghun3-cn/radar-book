import siteContent from "../data/site-content.json";
import type { Locale, SiteCopy, TutorialProject } from "../types";

const SUFFIX: Record<Locale, string> = { zh: "", en: "En", ja: "Ja", ko: "Ko" };
const BASE_URL = String(import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "";

export function copyForLocale(locale: Locale): SiteCopy {
  const raw = siteContent.copy[locale] as unknown as SiteCopy;
  const merged = { ...raw, categoryLabels: {} } as SiteCopy;
  const categoryLabels = siteContent.categoryLabels as Record<string, Partial<Record<Locale, string>>>;
  for (const [key, labels] of Object.entries(categoryLabels)) {
    merged.categoryLabels[key] = labels[locale] ?? labels.zh ?? key;
  }
  return merged;
}

export function summaryForLocale(project: TutorialProject, locale: Locale): string {
  const suffix = SUFFIX[locale];
  const key = suffix ? `plainSummary${suffix}` : "plainSummary";
  const value = project[key as keyof TutorialProject];
  return typeof value === "string" && value ? value : (project.plainSummary ?? "");
}

export function localeHref(locale: Locale): string {
  return `${BASE_URL}${locale === "zh" ? "/" : `/${locale}/`}`;
}
