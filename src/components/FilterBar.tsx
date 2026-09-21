import { useMemo } from "react";
import { Bookmark, RotateCcw, Search } from "lucide-react";
import type { SortKey, TutorialProject } from "../types";
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
    <section className="controls" aria-label="筛选与排序">
      <div className="controls-row">
        <label className="search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            placeholder="搜索名称、作者、标签或简介"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <select
          className="select"
          aria-label="排序方式"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
        >
          <option value="stars">按星标排序</option>
          <option value="updated">按最近更新</option>
          <option value="name">按名称排序</option>
        </select>
        <button
          type="button"
          className={`outline-btn ${onlySaved ? "active" : ""}`}
          aria-pressed={onlySaved}
          onClick={() => onOnlySavedChange(!onlySaved)}
        >
          <Bookmark size={15} />
          仅收藏
        </button>
        {hasFilters ? (
          <button type="button" className="outline-btn" onClick={() => {
            onQueryChange("");
            onCategoryChange("all");
            onClearTags();
            onOnlySavedChange(false);
          }}>
            <RotateCcw size={15} />
            重置
          </button>
        ) : null}
        <span className="result-count">{resultCount} / {projects.length}</span>
      </div>

      <div className="chip-group" role="group" aria-label="按分类筛选">
        {taxonomy.categories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip ${category === item.id ? "active" : ""}`}
            onClick={() => onCategoryChange(item.id)}
          >
            {item.label}
            {item.id !== "all" ? <span className="chip-count">{categoryCounts.get(item.id) ?? 0}</span> : null}
          </button>
        ))}
      </div>

      <div className="chip-group tag-group" role="group" aria-label="按标签筛选">
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
