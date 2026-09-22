import { ExternalLink, Heart, SearchX, ShieldCheck } from "lucide-react";
import { fillTemplate, formatCompact, formatDate } from "../lib/format";
import { summaryForLocale } from "../lib/i18n";
import type { Locale, SiteCopy, TutorialProject } from "../types";

interface ProjectListProps {
  projects: TutorialProject[];
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  onReset: () => void;
  locale: Locale;
  t: SiteCopy;
}

function ProjectRow({
  project,
  saved,
  onToggleFavorite,
  locale,
  t,
}: {
  project: TutorialProject;
  saved: boolean;
  onToggleFavorite: (id: string) => void;
  locale: Locale;
  t: SiteCopy;
}) {
  const summary = summaryForLocale(project, locale);
  return (
    <article className="result-row">
      <div className="avatar-wrap">
        {project.avatarUrl ? (
          <img className="avatar" src={project.avatarUrl} alt="" loading="lazy" />
        ) : (
          <span className="avatar avatar-fallback" aria-hidden="true">
            {project.author.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="row-main">
        <div className="row-title">
          <a href={project.url} target="_blank" rel="noreferrer">
            {project.name}
          </a>
          <span className="badge">{t.categoryLabels[project.category] ?? project.category}</span>
          {project.verificationStatus === "source-verified" ? (
            <span className="verified" title={t.verifiedTitle}>
              <ShieldCheck size={13} />
              {t.verified}
            </span>
          ) : null}
        </div>
        <p className="row-summary">{summary || t.noSummary}</p>
        <div className="row-tags">
          {project.tags.map((tag) => (
            <span key={tag} className="mini-tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="row-meta">
          <span title="Stars">{formatCompact(project.stars)} {t.stars}</span>
          {project.language ? <span title={t.languageTitle}>{project.language}</span> : null}
          {project.license ? <span title={t.licenseTitle}>{project.license}</span> : <span title={t.noLicense}>{t.noLicense}</span>}
          <span title={t.updatedTitle}>{t.updatedPrefix}{formatDate(project.lastCommitAt)}</span>
        </div>
      </div>
      <div className="row-side">
        <button
          type="button"
          className={`icon-btn star-btn ${saved ? "saved" : ""}`}
          aria-label={fillTemplate(saved ? t.favoriteRemove : t.favoriteAdd, { name: project.name })}
          title={saved ? t.favoriteTitleActive : t.favoriteTitle}
          onClick={() => onToggleFavorite(project.id)}
        >
          <Heart size={15} fill={saved ? "currentColor" : "none"} />
        </button>
        <a
          className="icon-btn"
          href={project.url}
          target="_blank"
          rel="noreferrer"
          aria-label={fillTemplate(t.openRepo, { name: project.name })}
          title={t.openRepository}
        >
          <ExternalLink size={15} />
        </a>
      </div>
    </article>
  );
}

export default function ProjectList({ projects, favoriteIds, onToggleFavorite, onReset, locale, t }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="empty">
        <SearchX size={26} aria-hidden="true" />
        <p>{t.emptyTitle}</p>
        <button type="button" className="outline-btn" onClick={onReset}>
          {t.resetFilters}
        </button>
      </div>
    );
  }
  return (
    <section className="results" aria-label={t.resultsTitle}>
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          saved={favoriteIds.has(project.id)}
          onToggleFavorite={onToggleFavorite}
          locale={locale}
          t={t}
        />
      ))}
    </section>
  );
}
