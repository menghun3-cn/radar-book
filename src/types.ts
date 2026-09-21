export interface TutorialProject {
  id: string;
  name: string;
  author: string;
  url: string;
  category: string;
  plainSummary: string;
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
