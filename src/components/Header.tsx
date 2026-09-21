import { Moon, Radar, Sun } from "lucide-react";
import siteContent from "../data/site-content.json";
import { localeHref } from "../lib/i18n";
import { statusLabel, timeAgo } from "../lib/format";
import type { Locale, RadarMeta, SiteCopy } from "../types";

interface HeaderProps {
  meta: RadarMeta | null;
  dark: boolean;
  onToggleDark: () => void;
  locale: Locale;
  t: SiteCopy;
}

function localeLabel(locale: Locale): string {
  return (siteContent as { localeMeta: Record<Locale, { label: string }> }).localeMeta[locale].label;
}

export default function Header({ meta, dark, onToggleDark, locale, t }: HeaderProps) {
  const status = statusLabel(meta?.status ?? null, t);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Radar size={16} strokeWidth={2.4} />
          </span>
          <span className="brand-name">{t.brand}</span>
        </div>
        <div className="topbar-right">
          <nav className="locale-switch" aria-label={t.localeAria}>
            {(["zh", "en", "ja", "ko"] as Locale[]).map((item) => (
              <a
                key={item}
                className={item === locale ? "locale-link active" : "locale-link"}
                href={localeHref(item)}
                lang={item}
                aria-current={item === locale ? "true" : undefined}
              >
                {localeLabel(item)}
              </a>
            ))}
          </nav>
          <span className="radar-status" title={meta?.lastRunAt ? `最近扫描 ${timeAgo(meta.lastRunAt, t)}` : t.timeNever}>
          <span className={`status-dot ${status.tone}`} aria-hidden="true" />
          <span className="status-text">{status.text}</span>
          {meta?.lastRunAt ? <span className="status-time">{timeAgo(meta.lastRunAt, t)}</span> : null}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label={dark ? t.themeLight : t.themeDark}
            title={dark ? t.lightModeTitle : t.darkModeTitle}
            onClick={onToggleDark}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}
