import { test } from "node:test";
import assert from "node:assert/strict";
import { preparePublicProject, sanitizePublicText } from "./prepare-public-data.mjs";

test("sanitizePublicText redacts tokens and local paths", () => {
  const clean = sanitizePublicText(
    "token=sk-abcdefghijklmnop123456789 path=C:\\Users\\bob\\secret also=/Users/bob/x",
  );
  assert.ok(!clean.includes("sk-abcdefghijklmnop123456789"));
  assert.ok(!clean.includes("C:\\Users\\bob"));
  assert.ok(!clean.includes("/Users/bob/x"));
  assert.ok(clean.includes("[redacted]"));
});

test("sanitizePublicText strips code blocks", () => {
  const clean = sanitizePublicText("before ```py\ndef secret(): pass\n``` after");
  assert.ok(!clean.includes("def secret"));
  assert.match(clean, /before/);
  assert.match(clean, /after/);
});

test("sanitizePublicText keeps https URLs intact", () => {
  const clean = sanitizePublicText("see https://github.com/anthropics/prompt-eng-interactive-tutorial");
  assert.ok(clean.includes("https://github.com/anthropics/prompt-eng-interactive-tutorial"));
});

test("preparePublicProject keeps only public fields", () => {
  const project = {
    id: "a/b",
    name: "b",
    author: "a",
    url: "https://github.com/a/b",
    category: "LLM 开发",
    plainSummary: "ok",
    tags: ["llm"],
    stars: 10,
    forks: 1,
    openIssues: 0,
    license: "MIT",
    language: "Python",
    createdAt: "2024-01-01",
    lastCommitAt: "2025-01-01",
    pushedAt: "2025-01-02",
    metadataFetchedAt: "2025-01-03",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
    topics: [],
    archived: false,
    headSha: "abc",
    sourceUrl: "https://github.com/a/b/blob/abc/README.md",
    sourcePath: "README.md",
    evidenceLines: [1],
    evidence: [],
    verificationStatus: "source-verified",
    pinned: false,
    repoId: 99,
    metadataError: "boom",
    runtimeVerified: false,
    catalogStatus: "active",
    summarySource: "human-reviewed",
  };
  const entry = preparePublicProject(project);
  assert.equal(entry.repoId, undefined);
  assert.equal(entry.metadataError, undefined);
  assert.equal(entry.runtimeVerified, undefined);
  assert.equal(entry.catalogStatus, undefined);
  assert.equal(entry.id, "a/b");
  assert.equal(entry.stars, 10);
});

test("preparePublicProject marks review-pending summaries and licenses", () => {
  const entry = preparePublicProject({
    id: "x/y",
    plainSummary: "secret payload",
    license: "MIT",
    catalogStatus: "review-pending",
  });
  assert.equal(entry.license, null);
  assert.match(entry.plainSummary, /复核/);
});
