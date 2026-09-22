import { useMemo, useState } from "react";
import { Bookmark, ChevronDown, ChevronUp, RotateCcw, Search } from "lucide-react";
import type { SiteCopy, SortKey, TutorialProject } from "../types";
import taxonomy from "../data/taxonomy.json";

type FilterGroupId = "subject" | "contentType" | "technology";

interface FilterBarProps {
  projects: TutorialProject[];
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

const CORE_VISIBLE: Record<FilterGroupId, number> = {
  subject: 7,
  contentType: 7,
  technology: 6,
};

const SUBJECT_CORE_IDS = ["all", "生成式 AI", "LLM 开发", "AI Agent", "机器学习", "深度学习", "数据科学"];

const CONTENT_TYPE_ORDER = [
  "tutorial",
  "course",
  "notebook",
  "exercises",
  "guide",
  "book",
  "interactive",
  "jupyter",
  "cookbook",
];

const TECHNOLOGY_ORDER = [
  "llm",
  "rag",
  "agents",
  "prompt-engineering",
  "fine-tuning",
  "deep-learning",
  "machine-learning",
  "reinforcement-learning",
  "data-science",
  "generative-ai",
  "beginner",
  "practical",
  "pytorch",
];

interface FilterItem {
  id: string;
  label: string;
  count: number | null;
  active: boolean;
}

export default function FilterBar({
  projects,
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
  const [expanded, setExpanded] = useState<Partial<Record<FilterGroupId, boolean>>>({});

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

  const subjectItems = useMemo<FilterItem[]>(() => {
    const ordered = [...SUBJECT_CORE_IDS];
    const rest = taxonomy.categories.filter((item) => !ordered.includes(item.id)).map((item) => item.id);
    return [...ordered, ...rest].map((id) => {
      const taxonomyItem = taxonomy.categories.find((item) => item.id === id);
      return {
        id,
        label: taxonomyItem ? (t.categoryLabels[taxonomyItem.label] ?? taxonomyItem.label) : id,
        count: id === "all" ? null : (categoryCounts.get(id) ?? 0),
        active: category === id,
      };
    });
  }, [t, category, categoryCounts]);

  const contentItems = useMemo<FilterItem[]>(
    () =>
      CONTENT_TYPE_ORDER.filter((slug) => (tagCounts.get(slug) ?? 0) > 0).map((slug) => ({
        id: slug,
        label: t.contentTypeLabels[slug] ?? slug,
        count: tagCounts.get(slug) ?? 0,
        active: selectedTags.includes(slug),
      })),
    [t, tagCounts, selectedTags],
  );

  const technologyItems = useMemo<FilterItem[]>(
    () =>
      TECHNOLOGY_ORDER.filter((slug) => (tagCounts.get(slug) ?? 0) > 0).map((slug) => ({
        id: slug,
        label: t.technologyLabels[slug] ?? slug,
        count: tagCounts.get(slug) ?? 0,
        active: selectedTags.includes(slug),
      })),
    [t, tagCounts, selectedTags],
  );

  const groups = [
    {
      id: "subject" as const,
      label: t.filterSubject,
      items: subjectItems,
      onSelect: (id: string) => onCategoryChange(id),
    },
    {
      id: "contentType" as const,
      label: t.filterContentType,
      items: contentItems,
      onSelect: (id: string) => onTagToggle(id),
    },
    {
      id: "technology" as const,
      label: t.filterTechnology,
      items: technologyItems,
      onSelect: (id: string) => onTagToggle(id),
    },
  ];

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
          <button
            type="button"
            className="outline-btn"
            onClick={() => {
              onQueryChange("");
              onCategoryChange("all");
              onClearTags();
              onOnlySavedChange(false);
            }}
          >
            <RotateCcw size={15} />
            {t.reset}
          </button>
        ) : null}
      </div>

      <div className="filter-groups">
        {groups.map((group) => {
          const coreCount = CORE_VISIBLE[group.id];
          const isExpanded = Boolean(expanded[group.id]);
          const pinnedActive = isExpanded ? [] : group.items.slice(coreCount).filter((item) => item.active);
          const visibleItems = isExpanded
            ? [...group.items.slice(0, coreCount), ...group.items.slice(coreCount)]
            : [...group.items.slice(0, coreCount), ...pinnedActive];
          const showMore = group.items.length > coreCount;
          return (
            <div className="filter-group" key={group.id}>
              <h3 className="filter-label">{group.label}</h3>
              <div className="filter-items" role="group" aria-label={group.label}>
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`chip ${item.active ? "active" : ""}`}
                    aria-pressed={item.active}
                    onClick={() => group.onSelect(item.id)}
                  >
                    {item.label}
                    {item.count !== null ? <span className="chip-count">{item.count}</span> : null}
                  </button>
                ))}
                {showMore ? (
                  <button
                    type="button"
                    className="more-btn"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((previous) => ({ ...previous, [group.id]: !previous[group.id] }))}
                  >
                    {isExpanded ? t.collapseFilters : t.moreFilters}
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
