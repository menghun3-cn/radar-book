import { Moon, Radar, Sun } from "lucide-react";
import type { RadarMeta } from "../types";
import { statusLabel, timeAgo } from "../lib/format";

interface HeaderProps {
  meta: RadarMeta | null;
  dark: boolean;
  onToggleDark: () => void;
}

export default function Header({ meta, dark, onToggleDark }: HeaderProps) {
  const status = statusLabel(meta?.status ?? null);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Radar size={16} strokeWidth={2.4} />
          </span>
          <span className="brand-name">AI Tutorial Radar</span>
        </div>
        <div className="topbar-right">
          <span className="radar-status" title={meta?.lastRunAt ? `最近扫描 ${timeAgo(meta.lastRunAt)}` : "尚未运行雷达"}>
            <span className={`status-dot ${status.tone}`} aria-hidden="true" />
            {status.text}
            {meta?.lastRunAt ? <span className="status-time">{timeAgo(meta.lastRunAt)}</span> : null}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label={dark ? "切换到浅色模式" : "切换到深色模式"}
            title={dark ? "浅色模式" : "深色模式"}
            onClick={onToggleDark}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}
