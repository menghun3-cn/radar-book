import { useMemo } from "react";
import { Bookmark, RotateCcw, Search } from "lucide-react";
import { fillTemplate } from "../lib/format";
import type { SiteCopy, SortKey, TutorialProject } from "../types";
import taxonomy from "../data/taxonomy.json";

interface FilterBarProps {
  projects: TutorialProject[];
  resultCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  onClearTags: () => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  onlySaved: boolean;
  onOnlySavedChange: (value: boolean) => void;
  t: SiteCopy;
}

export default function FilterBar({
  projects,
  resultCount,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  selectedTags,
  onTagToggle,
  onClearTags,
  sort,
  onSortChange,
  onlySaved,
  onOnlySavedChange,
  t,
}: FilterBarProps) {
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      counts.set(project.category, (counts.get(project.category) ?? 0) + 1);
    }
    return counts;
  }, [projects]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      for (const tag of project.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [projects]);

  const hasFilters = query !== "" || category !== "all" || selectedTags.length > 0 || onlySaved;

  return (
    <section className="controls" aria-label={t.filtersAria}>
      <div className="controls-row">
        <label className="search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <select
          className="select"
          aria-label={t.sortAria}
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
        >
          <option value="stars">{t.sortStars}</option>
          <option value="updated">{t.sortUpdated}</option>
          <option value="name">{t.sortName}</option>
        </select>
        <button
          type="button"
          className={`outline-btn ${onlySaved ? "active" : ""}`}
          aria-pressed={onlySaved}
          onClick={() => onOnlySavedChange(!onlySaved)}
        >
          <Bookmark size={15} />
          {t.onlySaved}
        </button>
        {hasFilters ? (
          <button type="button" className="outline-btn" onClick={() => {
            onQueryChange("");
            onCategoryChange("all");
            onClearTags();
            onOnlySavedChange(false);
          }}>
            <RotateCcw size={15} />
            {t.reset}
          </button>
        ) : null}
        <span className="result-count">{fillTemplate(t.resultCount, { result: resultCount, total: projects.length })}</span>
      </div>

      <div className="chip-group" role="group" aria-label={t.categoryGroupAria}>
        {taxonomy.categories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip ${category === item.id ? "active" : ""}`}
            onClick={() => onCategoryChange(item.id)}
          >
            {t.categoryLabels[item.label] ?? item.label}
            {item.id !== "all" ? <span className="chip-count">{categoryCounts.get(item.id) ?? 0}</span> : null}
          </button>
        ))}
      </div>

      <div className="chip-group tag-group" role="group" aria-label={t.tagGroupAria}>
        {taxonomy.tags.filter((tag) => (tagCounts.get(tag) ?? 0) > 0).map((tag) => (
          <button
            key={tag}
            type="button"
            className={`chip tag ${selectedTags.includes(tag) ? "active" : ""}`}
            aria-pressed={selectedTags.includes(tag)}
            onClick={() => onTagToggle(tag)}
          >
            {tag}
            <span className="chip-count">{tagCounts.get(tag) ?? 0}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
