import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { GitHubClient, paginationInfo, SEARCH_MAX_PAGE } from "./github-client.mjs";
import {
  findAiCategory,
  inspectRepository,
  mapTopicsToTags,
  mergeProject,
} from "./project-source.mjs";
import { createReviewer, reviewerConfig, extractReadmeSummary } from "./source-enrichment.mjs";
import { projectFromRepo, refreshMetadata } from "./project-builder.mjs";
import { readJSON, writeJSONAtomic, nowISO, sha256, clamp } from "./utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS_PATH = path.join(ROOT, "src", "data", "projects.json");
const RADAR_REPORT_PATH = path.join(ROOT, "src", "data", "radar.json");
const TAXONOMY_PATH = path.join(ROOT, "src", "data", "taxonomy.json");
const STATE_PATH = path.join(ROOT, "radar", "state.json");
const EXCLUSIONS_PATH = path.join(ROOT, "radar", "exclusions.json");
const QUERIES_PATH = path.join(ROOT, "radar", "queries.json");
const RECEIPTS_DIR = path.join(ROOT, "radar", "receipts");

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveToken() {
  const envToken =
    process.env.RADAR_GITHUB_TOKEN ??
    process.env.GITHUB_TOKEN ??
    process.env.GH_TOKEN;
  if (envToken) return envToken;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 10_000 }).trim();
  } catch {
    return null;
  }
}

function selfRepoFullName() {
  try {
    const url = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      encoding: "utf8",
      cwd: ROOT,
    }).trim();
    const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function runUrlFromEnv(env = process.env) {
  if (!env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) return "";
  return `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const mode = (process.env.RADAR_MODE ?? "full").toLowerCase();
  const metadataOnly = mode === "metadata-only";
  const maxPages = positiveInt(process.env.RADAR_MAX_PAGES, 2);
  const maxCandidates = positiveInt(process.env.RADAR_MAX_CANDIDATES, 40);
  const minStars = positiveInt(process.env.RADAR_MIN_STARS, 20);
  const minLessons = positiveInt(process.env.RADAR_MIN_LESSONS, 3);
  const perPage = 100;
  const selfFullName = selfRepoFullName();

  const projects = readJSON(PROJECTS_PATH);
  const taxonomy = readJSON(TAXONOMY_PATH);
  const state = readJSON(STATE_PATH);
  const exclusions = readJSON(EXCLUSIONS_PATH);
  const exclusionIds = new Set(
    exclusions.map((item) => (typeof item === "string" ? item.toLowerCase() : item.id.toLowerCase())),
  );
  const receipts = [];

  const token = resolveToken();
  if (!token) throw new Error("Missing GitHub token. Set RADAR_GITHUB_TOKEN / GITHUB_TOKEN, or run `gh auth login`.");
  const client = new GitHubClient({ token });
  const reviewerConfigValue = reviewerConfig();
  const reviewer = createReviewer(reviewerConfigValue);

  const byRepoId = new Map();
  for (const project of projects) {
    if (project.repoId != null) byRepoId.set(Number(project.repoId), project);
    byRepoId.set(project.id, project);
  }

  const discovery = { candidates: 0, checked: 0, rejected: 0, deferred: 0 };
  const metadata = { ok: 0, failed: 0 };
  let newProjects = 0;

  const sourcesReport = [];
  const candidateMap = new Map();

  async function addCandidate(repo, hitPath) {
    const id = String(repo.full_name).toLowerCase();
    if (!repo || repo.private || repo.fork || exclusionIds.has(id) || byRepoId.has(Number(repo.id)) || byRepoId.has(id)) {
      return;
    }
    if (selfFullName && id === selfFullName) return;
    const existing = candidateMap.get(id);
    candidateMap.set(id, {
      id,
      repo,
      paths: unique([...(existing?.paths ?? []), hitPath].filter(Boolean)),
    });
  }

  async function discover(client) {
    if (metadataOnly) return;
    const queries = readJSON(QUERIES_PATH);
    const enabledSources = new Set(
      (process.env.RADAR_SOURCES ?? "repositories,code")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

    for (const [kind, group] of Object.entries(queries)) {
      if (!enabledSources.has(kind)) continue;
      for (const entry of group) {
        const cursorKey = `${kind}:${entry.query}`;
        state._searchCursors ??= {};
        let page = clamp(Number(state._searchCursors[cursorKey]) || 1, 1, SEARCH_MAX_PAGE);
        const firstPage = page;
        let fetchedPages = 0;
        let count = 0;
        let total = 0;
        let finished = false;

        try {
          while (fetchedPages < maxPages && page <= SEARCH_MAX_PAGE) {
            const data =
              kind === "code"
                ? await client.searchCode(entry.query, page, perPage)
                : await client.searchRepositories(entry.query, page, perPage);
            total = Number(data.total_count ?? 0);
            count += data.items?.length ?? 0;
            for (const item of data.items ?? []) {
              if (kind === "code") {
                await addCandidate(item.repository, item.path);
              } else {
                await addCandidate(item, item.path ?? null);
              }
            }
            fetchedPages += 1;
            const { lastPage } = paginationInfo(total, page, perPage);
            finished = page >= lastPage;
            if (finished) break;
            page += 1;
          }

          let status = "ok";
          if (total > perPage * SEARCH_MAX_PAGE) status = "search-cap";
          else if (!finished) status = "bounded";
          state._searchCursors[cursorKey] = finished ? 1 : clamp(page, 1, SEARCH_MAX_PAGE);
          sourcesReport.push({
            name: entry.name,
            status,
            count,
            total,
            pages: fetchedPages,
            firstPage,
          });
        } catch (error) {
          state._searchCursors[cursorKey] ??= 1;
          sourcesReport.push({
            name: entry.name,
            status: "unavailable",
            count,
            total,
            pages: fetchedPages,
            firstPage,
            error: error.message,
          });
        }
      }
    }
  }

  async function queueExplicitRepos(client) {
    if (metadataOnly) return;
    const repos = (process.env.RADAR_REPOS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    for (const spec of repos) {
      try {
        const repo = await client.getRepo(spec);
        await addCandidate(repo, null);
        sourcesReport.push({ name: `repositories: explicit:${spec}`, status: "ok", count: 1, total: 1, pages: 1, firstPage: 1 });
      } catch (error) {
        sourcesReport.push({
          name: `repositories: explicit:${spec}`,
          status: "unavailable",
          count: 0,
          total: 0,
          pages: 0,
          error: error.message,
        });
      }
    }
  }

  await discover(client);
  await queueExplicitRepos(client);
  discovery.candidates = candidateMap.size;

  const now = Date.now();
  const sorted = [...candidateMap.values()].sort((a, b) => {
    const aChecked = state.checkedAt?.[a.id] ? new Date(state.checkedAt[a.id]).getTime() || 0 : 0;
    const bChecked = state.checkedAt?.[b.id] ? new Date(state.checkedAt[b.id]).getTime() || 0 : 0;
    const aEducational = /\b(tutorial|course|lesson|book|curriculum)\b/i.test(a.id) ? 1 : 0;
    const bEducational = /\b(tutorial|course|lesson|book|curriculum)\b/i.test(b.id) ? 1 : 0;
    return aChecked - bChecked || bEducational - aEducational || (b.repo.stargazers_count ?? 0) - (a.repo.stargazers_count ?? 0);
  });
  const budget = sorted.slice(0, maxCandidates);
  discovery.deferred = Math.max(0, sorted.length - budget.length);

  const resultById = new Map();
  for (const project of projects) resultById.set(project.id, project);

  async function refreshExistingProject(project) {
    const receipt = { id: project.id, action: "metadata", at: nowISO() };
    try {
      const repo = await client.getRepo(project.id);
      const branch = repo.default_branch;
      const headSha = branch ? await client.getBranchHead(project.id, branch) : null;
      const merged = refreshMetadata(project, repo, headSha);
      resultById.set(merged.id, merged);
      state.checkedAt ??= {};
      state.checkedAt[merged.id] = nowISO();
      metadata.ok += 1;
      receipt.ok = true;
    } catch (error) {
      metadata.failed += 1;
      receipt.ok = false;
      receipt.reason = error.message;
    }
    receipts.push(receipt);
  }

  for (const project of projects) {
    if (project.catalogStatus !== "active" && project.catalogStatus !== "review-pending") continue;
    await refreshExistingProject(project);
  }

  for (const goal of budget) {
    const id = goal.id;
    const receipt = { id, action: "reject", at: nowISO() };
    const wasKnown = byRepoId.has(Number(goal.repo.id)) || byRepoId.has(id);

    try {
      const repo = await client.getRepo(id);
      if ((repo.stargazers_count ?? 0) < minStars) {
        receipt.reason = `below ${minStars} stars`;
        receipts.push(receipt);
        discovery.rejected += 1;
        pushExclusion(exclusions, id, receipt.reason);
        continue;
      }

      const inspected = await inspectRepository(client, repo, { minLessons });
      if (!inspected.ok) {
        receipt.reason = inspected.reason;
        receipts.push(receipt);
        discovery.rejected += 1;
        pushExclusion(exclusions, id, receipt.reason);
        continue;
      }

      let review = null;
      if (reviewer) {
        review = await reviewer.reviewCandidate({
          repo,
          readme: inspected.readmeText,
          taxonomy,
        });
        if (review.verified === false) {
          receipt.reason = `llm: ${review.reason || "not verified"}`;
          receipts.push(receipt);
          discovery.rejected += 1;
          pushExclusion(exclusions, id, receipt.reason);
          continue;
        }
        if (review.verified === true) {
          receipt.llm = { confidence: review.confidence, reason: review.reason };
        }
      }

      const summary = review?.verified === true
        ? review.plainSummary || extractReadmeSummary(inspected.readmeText)
        : extractReadmeSummary(inspected.readmeText);
      const category = findAiCategory(
        `${inspected.readmeText} ${repo.description ?? ""}`,
        repo.topics ?? [],
        repo.full_name,
      );
      const tags = unique([
        ...(review?.tags ?? []),
        ...mapTopicsToTags(repo.topics ?? [], taxonomy.tags),
        ...(inspected.lessonCount >= 2 ? ["tutorial"] : []),
        "course",
      ]);

      const record = projectFromRepo({
        repo,
        headSha: inspected.headSha,
        sourcePath: inspected.sourcePath,
        evidenceLines: inspected.evidenceLines,
        lessonPaths: inspected.lessonPaths,
        readmeText: inspected.readmeText,
        summary,
        category,
        tags,
        summarySource: review?.verified === true ? "llm-reviewed" : "source-extracted",
        catalogStatus: review?.verified === true ? "active" : "review-pending",
      });

      const merged = mergeProject(byRepoId.get(id) ?? byRepoId.get(Number(goal.repo.id)), record);
      resultById.set(merged.id, merged);
      state.checkedAt ??= {};
      state.checkedAt[merged.id] = nowISO();
      receipt.action = "accept";
      receipt.verifiedAt = nowISO();
      receipts.push(receipt);
      discovery.checked += 1;
      if (!wasKnown) newProjects += 1;
    } catch (error) {
      receipt.action = "error";
      receipt.reason = error.message;
      receipts.push(receipt);
    }
  }

  const nextProjects = [...resultById.values()].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || (b.stars ?? 0) - (a.stars ?? 0),
  );

  const report = {
    status: metadataOnly
      ? "metadata-only"
      : discovery.deferred > 0
        ? "partial"
        : "complete",
    sources: sourcesReport,
    newProjects,
    metadata,
    discovery: {
      ...discovery,
      sources: sourcesReport.length,
    },
    totalProjects: nextProjects.length,
    projectsSha256: sha256(JSON.stringify(nextProjects)),
    runUrl: runUrlFromEnv(),
    dryRun,
  };

  state.lastRunAt = nowISO();
  report.lastRunAt = state.lastRunAt;

  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    console.log(`[dry-run] would write ${nextProjects.length} projects (${newProjects} new), ${receipts.length} receipt entries`);
    return;
  }

  writeJSONAtomic(PROJECTS_PATH, nextProjects);
  writeJSONAtomic(RADAR_REPORT_PATH, report);
  writeJSONAtomic(STATE_PATH, state);
  writeJSONAtomic(EXCLUSIONS_PATH, exclusions);
  const receiptFile = path.join(RECEIPTS_DIR, `${nowISO().replace(/[:.]/g, "-")}.json`);
  writeJSONAtomic(receiptFile, { runUrl: report.runUrl, createdAt: nowISO(), items: receipts });

  console.log(`[radar] ${mode} run complete: ${nextProjects.length} projects, ${newProjects} new, ${discovery.checked} checked, ${discovery.rejected} rejected, ${discovery.deferred} deferred, ${metadata.failed} metadata failures`);
  console.log(`[radar] sources: ${sourcesReport.filter((s) => s.status === "unavailable").length} unavailable; receipt ${path.relative(ROOT, receiptFile)}`);
}

function pushExclusion(exclusions, id, reason) {
  const existing = exclusions.find((item) => (typeof item === "string" ? item : item.id) === id);
  if (existing) return;
  exclusions.push({ id, reason, excludedAt: nowISO() });
}

main().catch((error) => {
  console.error(`[radar] fatal: ${error.message}`);
  process.exitCode = 1;
});
