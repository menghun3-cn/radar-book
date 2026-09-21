import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GitHubClient } from "./github-client.mjs";
import { projectFromRepo } from "./project-builder.mjs";
import { createReviewer, reviewerConfig, extractReadmeSummary } from "./source-enrichment.mjs";
import { findAiCategory, inspectRepository, mapTopicsToTags } from "./project-source.mjs";
import { readJSON, writeJSONAtomic, sha256, nowISO, sleep } from "./utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS_DIR = path.join(ROOT, "ingestion");
const RESULT_PATH = path.join(ARTIFACTS_DIR, "ingestion-result.json");
const CANDIDATE_PATH = path.join(ARTIFACTS_DIR, "candidate-projects.json");
const PROJECTS_PATH = path.join(ROOT, "src", "data", "projects.json");
const TAXONOMY_PATH = path.join(ROOT, "src", "data", "taxonomy.json");
const BRANCH_REF = "heads/master";
const ACK_MARKER = (issueNumber, repoId) => `<!-- ai-radar-ingestion:${issueNumber}:${repoId} -->`;

function selfRepo() {
  return (process.env.GITHUB_REPOSITORY ?? "").trim().toLowerCase();
}

function client() {
  const token = process.env.GITHUB_TOKEN ?? process.env.RADAR_GITHUB_TOKEN;
  if (!token) throw new Error("Missing GITHUB_TOKEN");
  return new GitHubClient({ token });
}

export function extractSubmittedRepository(body) {
  const text = String(body ?? "");
  const urlMatches = [...text.matchAll(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/gi)];
  if (urlMatches.length) {
    const own = selfRepo();
    const candidate = urlMatches.map((m) => m[1].toLowerCase()).find((value) => value !== own) ?? urlMatches[0][1].toLowerCase();
    return candidate;
  }
  const plain = [
    ...text.matchAll(/(?:^|[^A-Za-z0-9_.-])([A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100})(?=$|[^A-Za-z0-9_.-])/gm),
  ].map((m) => m[1].toLowerCase());
  const own = selfRepo();
  return plain.find((value) => value !== own) ?? plain[0] ?? null;
}

function normalizeRepoSpec(spec) {
  const cleaned = String(spec ?? "").trim().replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
  const match = cleaned.match(/^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/);
  return match ? match[0].toLowerCase() : null;
}

function bodyHash(body) {
  return sha256(String(body ?? ""));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function findDuplicate(projects, repo) {
  const id = String(repo.full_name ?? repo.id).toLowerCase();
  return projects.find(
    (project) =>
      project.id?.toLowerCase() === id ||
      (repo.id != null && Number(project.repoId) === Number(repo.id)) ||
      (repo.html_url && normalizeRepoSpec(project.url) === normalizeRepoSpec(repo.html_url)),
  );
}

async function readIssue() {
  const repo = selfRepo();
  if (process.env.INGEST_ISSUE_NUMBER) {
    return client().getIssue(repo, Number(process.env.INGEST_ISSUE_NUMBER));
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("No issue event found; set INGEST_ISSUE_NUMBER or GITHUB_EVENT_PATH");
  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const issue = event.issue ?? event.pull_request?.issue;
  if (!issue) throw new Error("Event does not include an issue");
  return issue;
}

function writeResult(result) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeJSONAtomic(RESULT_PATH, result);
}

function writeCandidate(projects) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeJSONAtomic(CANDIDATE_PATH, projects);
}

async function prepare() {
  const issue = await readIssue();
  const projects = readJSON(PROJECTS_PATH);
  const taxonomy = readJSON(TAXONOMY_PATH);
  const issueNumber = Number(issue.number);
  const issueBody = issue.body ?? "";
  const hash = bodyHash(issueBody);
  const baseResult = {
    issue: { number: issueNumber, title: issue.title ?? "", html_url: issue.html_url ?? "" },
    issueBodyHash: hash,
    status: "unknown",
    reason: null,
    review: null,
    projectId: null,
    repo: null,
    createdAt: nowISO(),
  };

  const spec = extractSubmittedRepository(issueBody);
  const normalized = normalizeRepoSpec(spec);
  if (!normalized) {
    writeResult({ ...baseResult, status: "rejected", reason: "提交内容里没有可识别的 GitHub 仓库（owner/repo 或仓库链接）" });
    writeCandidate(projects);
    console.log("[issue] no repository found");
    return;
  }

  const api = client();
  const repo = await api.getRepo(normalized);
  const duplicate = findDuplicate(projects, repo);
  const id = String(repo.full_name).toLowerCase();
  if (duplicate) {
    writeResult({ ...baseResult, status: "duplicate", reason: `仓库 ${id} 已在目录中`, repo: { full_name: repo.full_name, html_url: repo.html_url, id: repo.id }, projectId: duplicate.id });
    writeCandidate(projects);
    console.log(`[issue] duplicate ${id}`);
    return;
  }

  const inspected = await inspectRepository(api, repo);
  if (!inspected.ok) {
    writeResult({ ...baseResult, status: "rejected", reason: inspected.reason, repo: { full_name: repo.full_name, html_url: repo.html_url, id: repo.id } });
    writeCandidate(projects);
    console.log(`[issue] L1 rejected ${id}: ${inspected.reason}`);
    return;
  }

  const reviewer = createReviewer(reviewerConfig());
  let review = null;
  if (reviewer) {
    review = await reviewer.reviewCandidate({
      repo,
      readme: inspected.readmeText,
      codeSources: inspected.codeSources ?? [],
      taxonomy,
    });
    if (review.verified === false) {
      writeResult({
        ...baseResult,
        status: "rejected",
        reason: review.reason || "L2 评审未通过",
        review,
        repo: { full_name: repo.full_name, html_url: repo.html_url, id: repo.id },
      });
      writeCandidate(projects);
      console.log(`[issue] L2 rejected ${id}`);
      return;
    }
  }

  const verified = review?.verified === true;
  const status = verified ? "accepted" : "pending";
  const summary = verified && review.plainSummary
    ? review.plainSummary
    : extractReadmeSummary(inspected.readmeText);
  const category = findAiCategory(`${inspected.readmeText} ${repo.description ?? ""}`, repo.topics ?? [], repo.full_name);
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
    summarySource: verified ? "llm-reviewed" : "issue-pending",
    catalogStatus: verified ? "active" : "review-pending",
    plainSummaryEn: review?.plainSummaryEn ?? null,
    plainSummaryJa: review?.plainSummaryJa ?? null,
    plainSummaryKo: review?.plainSummaryKo ?? null,
  });
  record.ingestion = { issueNumber, issueBodyHash: hash, submittedAt: nowISO() };

  writeResult({
    ...baseResult,
    status,
    review,
    repo: { full_name: repo.full_name, html_url: repo.html_url, id: repo.id },
    projectId: record.id,
  });
  writeCandidate([...projects, record]);
  console.log(`[issue] ${status} ${record.id}`);
}

async function validate() {
  if (!fs.existsSync(CANDIDATE_PATH)) throw new Error("candidate-projects.json missing; run prepare first");
  const candidate = readJSON(CANDIDATE_PATH);
  if (!Array.isArray(candidate)) throw new Error("candidate projects must be an array");
  writeJSONAtomic(PROJECTS_PATH, candidate);
  console.log(`[issue] validate wrote ${candidate.length} projects to src/data/projects.json; build now runs against candidate data`);
}

async function publish() {
  const result = readJSON(RESULT_PATH);
  if (!["accepted", "pending"].includes(result.status)) {
    console.log(`[issue] no commit needed (${result.status})`);
    writeResult(result);
    return;
  }
  const repo = selfRepo();
  if (!repo) throw new Error("Missing GITHUB_REPOSITORY");
  const api = client();
  const issue = await api.getIssue(repo, result.issue.number);
  if (issue.state !== "open") {
    writeResult({ ...result, status: "stale", reason: "issue 已关闭，跳过发布" });
    console.log(`[issue] issue #${result.issue.number} is not open`);
    return;
  }
  if (bodyHash(issue.body ?? "") !== result.issueBodyHash) {
    writeResult({ ...result, status: "stale", reason: "issue 内容已变更，请重新触发 /ingest 复核" });
    console.log(`[issue] issue body changed; recreate with /ingest`);
    return;
  }

  const current = readJSON(PROJECTS_PATH);
  if (findDuplicate(current, { full_name: result.projectId, id: result.repo?.id, html_url: result.repo?.html_url })) {
    writeResult({ ...result, status: "duplicate", reason: "发布前检查发现仓库已存在" });
    console.log(`[issue] duplicate at publish time`);
    return;
  }

  const project = readJSON(CANDIDATE_PATH).find((item) => item.id === result.projectId);
  if (!project) throw new Error("candidate project missing from candidate-projects.json");
  const nextProjects = [...current, project];
  const content = JSON.stringify(nextProjects, null, 2) + "\n";
  const commitMessage = `data: ingest ${project.id} from #${result.issue.number}`;
  let commitSha = null;

  for (let attempt = 0; attempt < 3 && !commitSha; attempt += 1) {
    const ref = await api.getRef(repo, BRANCH_REF);
    const headSha = ref.object.sha;
    const commitInfo = await api.getCommit(repo, headSha);
    const blob = await api.createBlob(repo, content);
    const tree = await api.createTree(repo, commitInfo.tree.sha, [
      { path: "src/data/projects.json", mode: "100644", type: "blob", sha: blob.sha },
    ]);
    const commit = await api.createCommit(repo, commitMessage, tree.sha, [headSha]);
    try {
      await api.updateRef(repo, BRANCH_REF, commit.sha);
      commitSha = commit.sha;
    } catch {
      if (attempt < 2) await sleep(1_500);
    }
  }
  if (!commitSha) throw new Error("CAS publish failed after 3 attempts due to concurrent ref updates");

  writeResult({
    ...result,
    status: "published",
    committedSha: commitSha,
    commitUrl: `https://github.com/${repo}/commit/${commitSha}`,
  });
  console.log(`[issue] published ${commitMessage} at ${commitSha}`);
}

async function acknowledge() {
  const result = readJSON(RESULT_PATH);
  const repo = selfRepo();
  if (!repo) throw new Error("Missing GITHUB_REPOSITORY");
  const api = client();
  const issueNumber = result.issue.number;
  const marker = ACK_MARKER(issueNumber, result.repo?.id ?? "unknown");
  const comments = await api.listIssueComments(repo, issueNumber);
  if (comments.some((comment) => String(comment.body ?? "").includes(marker))) {
    console.log(`[issue] already acknowledged #${issueNumber}`);
    return;
  }

  const body = (content) => `${marker}\n\n${content}`;
  if (result.status === "published") {
    const published = await api.getFileText(repo, "src/data/projects.json", "master");
    const containsProject = Boolean(published && JSON.parse(published).some((item) => item.id === result.projectId));
    if (!containsProject) throw new Error(`published commit did not put ${result.projectId} into src/data/projects.json`);
    await api.createIssueComment(repo, issueNumber, body(
      `已自动完成 L1 核验与 L2 评审并提交到 master（${result.commitUrl}）。部署流水线会自动发布，感谢提交！`,
    ));
    await api.updateIssue(repo, issueNumber, "closed");
    console.log(`[issue] acknowledged and closed #${issueNumber}`);
    return;
  }

  if (result.status === "pending") {
    await api.createIssueComment(repo, issueNumber, body(
      "已通过 L1 静态核验并进入待人工复核队列。配置 L2 LLM 评审后会再次自动处理；你也可以使用 /ingest 重新触发。",
    ));
    try {
      await api.addIssueLabels(repo, issueNumber, ["needs-review"]);
    } catch {
      // Label may already exist or be unavailable.
    }
    console.log(`[issue] kept #${issueNumber} open for review`);
    return;
  }

  if (result.status === "duplicate") {
    await api.createIssueComment(repo, issueNumber, body(`该仓库已在目录中（${result.reason ?? ""}）。`));
    await api.updateIssue(repo, issueNumber, "closed");
    console.log(`[issue] closed duplicate #${issueNumber}`);
    return;
  }

  if (result.status === "rejected") {
    await api.createIssueComment(repo, issueNumber, body(`核验未通过，暂不收录。原因：${result.reason ?? "未知"}`));
    await api.updateIssue(repo, issueNumber, "closed");
    console.log(`[issue] closed rejected #${issueNumber}`);
    return;
  }

  if (result.status === "stale") {
    await api.createIssueComment(repo, issueNumber, body(`表单或状态已变化（${result.reason ?? "unknown"}）。如仍要提交，请在 issue 中回复 /ingest 重新触发。`));
    console.log(`[issue] left stale #${issueNumber} open`);
  }
}

const command = process.argv[2];
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  if (["prepare", "validate", "publish", "acknowledge"].includes(command)) {
    const fn = { prepare, validate, publish, acknowledge }[command];
    fn().catch((error) => {
      console.error(`[issue] ${command} failed: ${error.message}`);
      process.exitCode = 1;
    });
  } else {
    console.error("usage: node scripts/issue-ingestion.mjs <prepare|validate|publish|acknowledge>");
    process.exitCode = 1;
  }
}
