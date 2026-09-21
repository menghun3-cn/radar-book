import { test } from "node:test";
import assert from "node:assert/strict";
import { projectFromRepo } from "./project-builder.mjs";

const fakeRepo = {
  full_name: "a/b",
  name: "b",
  owner: { login: "a", avatar_url: "https://avatars.githubusercontent.com/u/1" },
  html_url: "https://github.com/a/b",
  id: 1,
  stargazers_count: 10,
  forks_count: 1,
  open_issues_count: 0,
  license: { spdx_id: "MIT" },
  language: "Python",
  created_at: "2024-01-01T00:00:00Z",
  pushed_at: "2025-01-01T00:00:00Z",
  topics: ["ai"],
  archived: false,
};

test("projectFromRepo defaults to active for curated seed entries", () => {
  const project = projectFromRepo({
    repo: fakeRepo,
    headSha: "abc",
    sourcePath: "README.md",
    summary: "ok",
    category: "LLM 开发",
    tags: ["llm"],
  });
  assert.equal(project.catalogStatus, "active");
  assert.equal(project.sourceUrl, "https://github.com/a/b/blob/abc/README.md");
});

test("projectFromRepo keeps auto-discovered candidates in review-pending", () => {
  const project = projectFromRepo({
    repo: fakeRepo,
    headSha: "abc",
    sourcePath: "README.md",
    summary: "ok",
    category: "LLM 开发",
    tags: ["llm"],
    summarySource: "source-extracted",
    catalogStatus: "review-pending",
  });
  assert.equal(project.catalogStatus, "review-pending");
});
