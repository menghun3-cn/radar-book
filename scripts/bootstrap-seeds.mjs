import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { GitHubClient } from "./github-client.mjs";
import { inspectRepository } from "./project-source.mjs";
import { projectFromRepo } from "./project-builder.mjs";
import { readJSON, writeJSONAtomic, nowISO } from "./utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "scripts", "seed-manifest.json");
const PROJECTS_PATH = path.join(ROOT, "src", "data", "projects.json");
const TAXONOMY_PATH = path.join(ROOT, "src", "data", "taxonomy.json");

function tokenFromGh() {
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 10_000 }).trim();
  } catch {
    return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
  }
}

async function main() {
  const manifest = readJSON(MANIFEST_PATH);
  const taxonomy = readJSON(TAXONOMY_PATH);
  const client = new GitHubClient({ token: tokenFromGh() });
  if (!client.token) throw new Error("No GitHub token; run with GITHUB_TOKEN or `gh auth login` first.");

  const projects = [];
  for (const seed of manifest) {
    const repo = await client.getRepo(seed.id);
    const branch = repo.default_branch;
    const headSha = branch ? await client.getBranchHead(seed.id, branch) : null;
    if (!headSha) {
      console.warn(`[warn] ${seed.id}: cannot resolve HEAD, skipped`);
      continue;
    }

    let inspection = null;
    try {
      inspection = await inspectRepository(client, repo, { minLessons: 3 });
      if (!inspection.ok) {
        console.warn(`[warn] ${seed.id}: ${inspection.reason}`);
      }
    } catch (error) {
      console.warn(`[warn] ${seed.id}: inspection failed (${error.message}); keeping seed`);
    }

    const project = projectFromRepo({
      repo,
      headSha,
      sourcePath: inspection?.sourcePath ?? "README.md",
      evidenceLines: inspection?.evidenceLines ?? [],
      lessonPaths: inspection?.lessonPaths ?? [],
      readmeText: inspection?.readmeText ?? "",
      summary: seed.summary,
      category: seed.category,
      tags: seed.tags,
      summarySource: "human-reviewed",
      pinned: Boolean(seed.pinned),
    });
    projects.push(project);
  }

  projects.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.stars - a.stars);
  writeJSONAtomic(PROJECTS_PATH, projects);
  console.log(`[bootstrap] wrote ${projects.length} seed projects to ${PROJECTS_PATH}`);
  console.log(`[bootstrap] categories: ${new Set(projects.map((p) => p.category)).size}, tags: ${new Set(projects.flatMap((p) => p.tags)).size}`);
  console.log(`[bootstrap] generated at ${nowISO()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
