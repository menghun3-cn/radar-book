import { nowISO } from "./utils.mjs";

export function projectFromRepo({
  repo,
  headSha,
  sourcePath,
  evidenceLines = [],
  lessonPaths = [],
  readmeText,
  summary,
  category,
  tags,
  summarySource = "source-extracted",
  plainSummaryEn = null,
  plainSummaryJa = null,
  plainSummaryKo = null,
  catalogStatus = "active",
  pinned = false,
}) {
  const sourceUrl = `${repo.html_url}/blob/${headSha}/${sourcePath}`;
  const licenseConfirmed = repo.license && !["NOASSERTION", "Other"].includes(repo.license.spdx_id);
  const evidence = [
    {
      url: sourceUrl,
      note: "Fixed-commit source reviewed",
    },
    ...lessonPaths.slice(0, 3).map((lessonPath) => ({
      url: `${repo.html_url}/blob/${headSha}/${lessonPath}`,
      note: "Lesson material",
    })),
  ];

  return {
    id: String(repo.full_name).toLowerCase(),
    name: repo.name,
    author: repo.owner?.login ?? String(repo.full_name).split("/")[0],
    url: repo.html_url,
    repoId: repo.id,
    category,
    plainSummary: summary ?? "",
    plainSummaryEn: plainSummaryEn ?? null,
    plainSummaryJa: plainSummaryJa ?? null,
    plainSummaryKo: plainSummaryKo ?? null,
    tags,
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    openIssues: repo.open_issues_count ?? 0,
    license: licenseConfirmed ? repo.license.spdx_id : null,
    language: repo.language ?? null,
    createdAt: repo.created_at,
    lastCommitAt: repo.pushed_at,
    pushedAt: repo.pushed_at,
    metadataFetchedAt: nowISO(),
    avatarUrl: repo.owner?.avatar_url ?? null,
    topics: repo.topics ?? [],
    archived: Boolean(repo.archived),
    headSha,
    sourceUrl,
    sourcePath,
    evidenceLines,
    evidence,
    verificationStatus: "source-verified",
    runtimeVerified: false,
    summarySource,
    licenseStatus: licenseConfirmed ? "confirmed" : "unconfirmed",
    sourceReviewedAt: nowISO(),
    catalogStatus,
    pinned,
  };
}

export function refreshMetadata(existing, repo, headSha) {
  return {
    ...existing,
    repoId: repo.id,
    stars: repo.stargazers_count ?? existing.stars,
    forks: repo.forks_count ?? existing.forks,
    openIssues: repo.open_issues_count ?? existing.openIssues,
    license: repo.license && !["NOASSERTION", "Other"].includes(repo.license.spdx_id)
      ? repo.license.spdx_id
      : (repo.license ? null : existing.license ?? null),
    language: repo.language ?? existing.language,
    createdAt: repo.created_at ?? existing.createdAt,
    lastCommitAt: repo.pushed_at ?? existing.lastCommitAt,
    pushedAt: repo.pushed_at ?? existing.pushedAt,
    metadataFetchedAt: nowISO(),
    avatarUrl: repo.owner?.avatar_url ?? existing.avatarUrl,
    topics: repo.topics ?? existing.topics ?? [],
    archived: Boolean(repo.archived),
    headSha: headSha ?? existing.headSha,
  };
}
