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

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "未扫描";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "未扫描";
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return formatDate(iso);
}

export function statusLabel(status: string | null): { text: string; tone: "ok" | "partial" | "seed" } {
  switch (status) {
    case "complete":
      return { text: "本轮扫描完成", tone: "ok" };
    case "partial":
      return { text: "扫描继续中，有排队项", tone: "partial" };
    case "metadata-only":
      return { text: "元数据已刷新", tone: "ok" };
    case "seed":
      return { text: "种子目录", tone: "seed" };
    default:
      return { text: "等待扫描", tone: "seed" };
  }
}
