import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRequiredFields, findInternalFields, findScannedSecrets } from "./audit-build.mjs";

test("findInternalFields detects private data", () => {
  const project = { id: "a/b", repoId: 1, summarySource: "human-reviewed", stars: 5 };
  assert.deepEqual(findInternalFields(project), ["repoId", "summarySource"]);
});

test("findScannedSecrets detects token patterns", () => {
  assert.ok(findScannedSecrets("github_pat_abc12345678901234567890").length > 0);
  assert.ok(findScannedSecrets("api key sk-abcdefghijklmnopqrstuvwx").length > 0);
  assert.deepEqual(findScannedSecrets("no secrets here"), []);
});

test("checkRequiredFields reports missing fields", () => {
  const project = { id: "a/b", name: "b", url: "https://x", category: "c", stars: 0, tags: [] };
  assert.deepEqual(checkRequiredFields(project), ["author", "plainSummary"]);
});
