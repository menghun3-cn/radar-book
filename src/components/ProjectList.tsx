import { Bookmark, ExternalLink, SearchX, ShieldCheck } from "lucide-react";
import type { TutorialProject } from "../types";
import { formatCompact, formatDate } from "../lib/format";

interface ProjectListProps {
  projects: TutorialProject[];
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  onReset: () => void;
}

function ProjectRow({
  project,
  saved,
  onToggleFavorite,
}: {
  project: TutorialProject;
  saved: boolean;
  onToggleFavorite: (id: string) => void;
}) {
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
          <span className="badge">{project.category}</span>
          {project.verificationStatus === "source-verified" ? (
            <span className="verified" title="已对固定 commit 的源码完成静态核验">
              <ShieldCheck size={13} />
              已核验
            </span>
          ) : null}
        </div>
        <p className="row-summary">{project.plainSummary || "暂无简介，等待雷达补充。"}</p>
        <div className="row-tags">
          {project.tags.map((tag) => (
            <span key={tag} className="mini-tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="row-meta">
          <span title="Stars">{formatCompact(project.stars)} stars</span>
          {project.language ? <span title="主要语言">{project.language}</span> : null}
          {project.license ? <span title="许可证">{project.license}</span> : <span title="未声明许可证">无许可</span>}
          <span title="最近推送">更新于 {formatDate(project.lastCommitAt)}</span>
        </div>
      </div>
      <div className="row-side">
        <button
          type="button"
          className={`icon-btn star-btn ${saved ? "saved" : ""}`}
          aria-label={saved ? `取消收藏 ${project.name}` : `收藏 ${project.name}`}
          title={saved ? "取消收藏" : "收藏"}
          onClick={() => onToggleFavorite(project.id)}
        >
          <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
        </button>
        <a
          className="icon-btn"
          href={project.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`打开 ${project.name}`}
          title="打开仓库"
        >
          <ExternalLink size={15} />
        </a>
      </div>
    </article>
  );
}

export default function ProjectList({ projects, favoriteIds, onToggleFavorite, onReset }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="empty">
        <SearchX size={26} aria-hidden="true" />
        <p>没有匹配的仓库</p>
        <button type="button" className="outline-btn" onClick={onReset}>
          重置筛选
        </button>
      </div>
    );
  }
  return (
    <section className="results" aria-label="仓库列表">
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          saved={favoriteIds.has(project.id)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </section>
  );
}
