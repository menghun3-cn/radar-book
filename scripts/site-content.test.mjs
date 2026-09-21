import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryLabelFor, localizedPagePath, projectRouteSlug, projectSummaryFor } from "./site-content.mjs";

test("projectRouteSlug produces stable file-system safe slugs", () => {
  assert.equal(projectRouteSlug({ id: "anthropics/Prompt-Eng-Interactive-Tutorial" }), "anthropics/prompt-eng-interactive-tutorial".replaceAll("/", "--"));
});

test("projectSummaryFor falls back to the Chinese summary without localized fields", () => {
  const project = { plainSummary: "中文简介", plainSummaryEn: "English" };
  assert.equal(projectSummaryFor(project, "zh"), "中文简介");
  assert.equal(projectSummaryFor(project, "en"), "English");
  assert.equal(projectSummaryFor(project, "ja"), "中文简介");
});

test("categoryLabelFor maps taxonomy categories per locale", () => {
  assert.equal(categoryLabelFor("提示词工程", "en"), "Prompt Engineering");
  assert.equal(categoryLabelFor("提示词工程", "ja"), "プロンプトエンジニアリング");
  assert.equal(categoryLabelFor("unknown", "en"), "unknown");
});

test("localizedPagePath maps routes across locales", () => {
  assert.equal(localizedPagePath("/projects/a--b/", "en"), "/en/projects/a--b/");
  assert.equal(localizedPagePath("/en/projects/a--b/", "ja"), "/ja/projects/a--b/");
  assert.equal(localizedPagePath("/", "ko"), "/ko/");
});
