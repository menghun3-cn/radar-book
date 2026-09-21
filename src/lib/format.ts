import type { SiteCopy } from "../types";

export function formatCompact(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function timeAgo(iso: string | null | undefined, copy: SiteCopy): string {
  if (!iso) return copy.timeNever;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return copy.timeNever;
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
  if (days === 0) return copy.timeToday;
  if (days === 1) return copy.timeYesterday;
  if (days < 30) return copy.timeDaysAgo.replace("{days}", String(days));
  return formatDate(iso);
}

export function statusLabel(
  status: string | null,
  copy: SiteCopy,
): { text: string; tone: "ok" | "partial" | "seed" } {
  switch (status) {
    case "complete":
      return { text: copy.statusComplete, tone: "ok" };
    case "partial":
      return { text: copy.statusPartial, tone: "partial" };
    case "metadata-only":
      return { text: copy.statusMetadataOnly, tone: "ok" };
    case "seed":
      return { text: copy.statusSeed, tone: "seed" };
    default:
      return { text: copy.statusWaiting, tone: "seed" };
  }
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
