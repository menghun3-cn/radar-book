import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSubmittedRepository } from "./issue-ingestion.mjs";

test("extractSubmittedRepository reads github.com URLs", () => {
  assert.equal(
    extractSubmittedRepository("推荐 https://github.com/anthropics/prompt-eng-interactive-tutorial 这个项目"),
    "anthropics/prompt-eng-interactive-tutorial",
  );
});

test("extractSubmittedRepository reads plain owner/repo values", () => {
  assert.equal(extractSubmittedRepository("GitHub repository: dair-ai/Prompt-Engineering-Guide"), "dair-ai/prompt-engineering-guide");
});

test("extractSubmittedRepository returns null when nothing looks like a repository", () => {
  assert.equal(extractSubmittedRepository("这里没有任何仓库标识"), null);
});
