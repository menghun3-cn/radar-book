export interface TutorialProject {
  id: string;
  name: string;
  author: string;
  url: string;
  category: string;
  plainSummary: string;
  plainSummaryEn?: string;
  plainSummaryJa?: string;
  plainSummaryKo?: string;
  tags: string[];
  stars: number;
  forks: number;
  openIssues: number;
  license: string | null;
  language: string | null;
  createdAt: string | null;
  lastCommitAt: string | null;
  pushedAt: string | null;
  metadataFetchedAt: string | null;
  avatarUrl: string | null;
  topics: string[];
  archived: boolean;
  headSha: string;
  sourceUrl: string;
  sourcePath: string;
  evidenceLines: number[];
  evidence: Array<{ url: string; note: string }>;
  verificationStatus: string;
  pinned?: boolean;
}

export interface RadarMeta {
  status: string | null;
  lastRunAt: string | null;
  totalProjects: number;
  projectsSha256: string | null;
}

export type SortKey = "stars" | "updated" | "name";

export type Locale = "zh" | "en" | "ja" | "ko";

export interface SiteCopy {
  brand: string;
  themeDark: string;
  themeLight: string;
  darkMode: string;
  lightMode: string;
  lightModeTitle: string;
  darkModeTitle: string;
  statusComplete: string;
  statusPartial: string;
  statusMetadataOnly: string;
  statusSeed: string;
  statusWaiting: string;
  lastScanned: string;
  loadState: string;
  errorRetry: string;
  retry: string;
  heroTitle: string;
  heroSub: string;
  heroStats: string;
  statProjects: string;
  statStars: string;
  statVerified: string;
  statSaved: string;
  filtersAria: string;
  searchPlaceholder: string;
  sortAria: string;
  sortStars: string;
  sortUpdated: string;
  sortName: string;
  onlySaved: string;
  reset: string;
  resultCount: string;
  filterSubject: string;
  filterContentType: string;
  filterTechnology: string;
  moreFilters: string;
  collapseFilters: string;
  categoryGroupAria: string;
  tagGroupAria: string;
  resultsTitle: string;
  resultsTotal: string;
  resultsNote: string;
  verified: string;
  verifiedTitle: string;
  noSummary: string;
  stars: string;
  updatedPrefix: string;
  noLicense: string;
  languageTitle: string;
  licenseTitle: string;
  updatedTitle: string;
  favoriteAdd: string;
  favoriteRemove: string;
  favoriteTitle: string;
  favoriteTitleActive: string;
  openRepo: string;
  openRepository: string;
  emptyTitle: string;
  emptyText: string;
  resetFilters: string;
  footerText: string;
  timeToday: string;
  timeYesterday: string;
  timeDaysAgo: string;
  timeNever: string;
  localeAria: string;
  categoryLabels: Record<string, string>;
  contentTypeLabels: Record<string, string>;
  technologyLabels: Record<string, string>;
}

export interface InitialPageData {
  locale: Locale;
  copy: SiteCopy;
  projects: TutorialProject[];
  meta: RadarMeta;
  page?: {
    category?: string;
    projectId?: string;
  };
}
