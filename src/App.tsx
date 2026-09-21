import { useEffect, useMemo, useState } from "react";
import { AlertCircle, RotateCcw, ShieldCheck, Star } from "lucide-react";
import Header from "./components/Header";
import FilterBar from "./components/FilterBar";
import ProjectList from "./components/ProjectList";
import { copyForLocale, summaryForLocale } from "./lib/i18n";
import { fillTemplate, formatCompact, statusLabel, timeAgo } from "./lib/format";
import { loadFavoriteIds, saveFavoriteIds } from "./lib/storage";
import type { InitialPageData, Locale, RadarMeta, SortKey, TutorialProject } from "./types";

const BASE = import.meta.env.BASE_URL || "/";

async function loadData() {
  const [projectsResponse, metaResponse] = await Promise.all([
    fetch(`${BASE}projects.json`),
    fetch(`${BASE}meta.json`),
  ]);
  if (!projectsResponse.ok || !metaResponse.ok) {
    throw new Error(`加载数据失败 (${projectsResponse.status}/${metaResponse.status})`);
  }
  const projects = (await projectsResponse.json()) as TutorialProject[];
  const meta = (await metaResponse.json()) as RadarMeta;
  return { projects, meta };
}

interface AppProps {
  initialData?: InitialPageData;
}

export default function App({ initialData }: AppProps) {
  const [projects, setProjects] = useState<TutorialProject[]>(() => initialData?.projects ?? []);
  const [meta, setMeta] = useState<RadarMeta | null>(() => initialData?.meta ?? null);
  const [locale] = useState<Locale>(() => initialData?.locale ?? "zh");
  const [t] = useState(() => initialData?.copy ?? copyForLocale("zh"));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!initialData);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(
    () => initialData?.page?.category === "all" ? "all" : (initialData?.page?.category ?? "all"),
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("stars");
  const [onlySaved, setOnlySaved] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => (typeof window === "undefined" ? new Set() : new Set(loadFavoriteIds())),
  );

  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem("theme") === "dark") return true;
    if (localStorage.getItem("theme") === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    setLoading(true);
    loadData()
      .then((data) => {
        if (cancelled) return;
        setProjects(data.projects);
        setMeta(data.meta);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "数据加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  useEffect(() => {
    saveFavoriteIds(favoriteIds);
  }, [favoriteIds]);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setQuery("");
    setCategory("all");
    setSelectedTags([]);
    setOnlySaved(false);
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = projects.filter((project) => {
      if (initialData?.page?.projectId && project.id !== initialData.page.projectId) return false;
      if (category !== "all" && project.category !== category) return false;
      if (selectedTags.length > 0 && !selectedTags.every((tag) => project.tags.includes(tag))) return false;
      if (onlySaved && !favoriteIds.has(project.id)) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        project.name,
        project.author,
        project.category,
        summaryForLocale(project, locale),
        project.tags.join(" "),
        project.language ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
    return result.sort((a, b) => {
      const pinned = Number(b.pinned ?? false) - Number(a.pinned ?? false);
      if (pinned !== 0) return pinned;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "updated") {
        return new Date(b.lastCommitAt ?? 0).getTime() - new Date(a.lastCommitAt ?? 0).getTime();
      }
      return b.stars - a.stars;
    });
  }, [projects, query, category, selectedTags, onlySaved, favoriteIds, sort, locale, initialData?.page?.projectId]);

  const stats = useMemo(() => {
    const totalStars = projects.reduce((sum, project) => sum + project.stars, 0);
    const verified = projects.filter((project) => project.verificationStatus === "source-verified").length;
    return { totalStars, verified };
  }, [projects]);

  const reload = () => {
    setLoading(true);
    loadData()
      .then((data) => {
        setProjects(data.projects);
        setMeta(data.meta);
        setError(null);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "数据加载失败"))
      .finally(() => setLoading(false));
  };

  const status = statusLabel(meta?.status ?? null, t);

  return (
    <div className="app">
      <Header meta={meta} dark={dark} onToggleDark={() => setDark((value) => !value)} locale={locale} t={t} />

      {loading ? (
        <div className="load-state" role="status">
          <span className="spinner" aria-hidden="true" />
          {t.loadState}
        </div>
      ) : error ? (
        <div className="load-state" role="alert">
          <AlertCircle size={22} aria-hidden="true" />
          <p>{t.errorRetry}</p>
          <button type="button" className="outline-btn" onClick={reload}>
            <RotateCcw size={15} />
            {t.retry}
          </button>
        </div>
      ) : (
        <>
          <section className="hero">
            <div className="hero-copy">
              <h1>{t.heroTitle}</h1>
              <p className="hero-sub">{t.heroSub}</p>
            </div>
            <div className="stats">
              <div className="stat">
                <span className="stat-label">{t.statProjects}</span>
                <span className="stat-value">{projects.length}</span>
              </div>
              <div className="stat">
                <span className="stat-label">{t.statStars}</span>
                <span className="stat-value">{formatCompact(stats.totalStars)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">{t.statVerified}</span>
                <span className="stat-value">{stats.verified}</span>
              </div>
              <div className="stat">
                <span className="stat-label">{t.statSaved}</span>
                <span className="stat-value">{favoriteIds.size}</span>
              </div>
            </div>
          </section>

          <FilterBar
            projects={projects}
            resultCount={filtered.length}
            query={query}
            onQueryChange={setQuery}
            category={category}
            onCategoryChange={setCategory}
            selectedTags={selectedTags}
            onTagToggle={(tag) =>
              setSelectedTags((previous) =>
                previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag],
              )
            }
            onClearTags={() => setSelectedTags([])}
            sort={sort}
            onSortChange={setSort}
            onlySaved={onlySaved}
            onOnlySavedChange={setOnlySaved}
            t={t}
          />

          <div className="results-head">
            <p className="results-title">{t.resultsTitle}</p>
            <p className="results-note">
              <Star size={13} /> {formatCompact(stats.totalStars)} {t.stars}
              {meta?.lastRunAt ? (
                <span>
                  <ShieldCheck size={13} /> {fillTemplate(t.resultsNote, {
                    stars: formatCompact(stats.totalStars),
                    time: timeAgo(meta.lastRunAt, t),
                  })}
                </span>
              ) : null}
            </p>
          </div>

          <ProjectList
            projects={filtered}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
            onReset={resetFilters}
            locale={locale}
            t={t}
          />

          <footer className="footer">
            <span>{t.footerText}</span>
            <span className="footer-status">
              <ShieldCheck size={13} />
              {status.text}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
