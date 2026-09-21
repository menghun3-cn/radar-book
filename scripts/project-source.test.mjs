import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countLessonFiles,
  evidenceLinesInText,
  isLessonPath,
  mergeProject,
  verifyTutorialSource,
} from "./project-source.mjs";
import { findReadmeEntry } from "./project-source.mjs";

test("verifyTutorialSource accepts a strong interactive tutorial README", () => {
  const readme = [
    "# Interactive Prompt Engineering Tutorial",
    "This course teaches lessons about prompt engineering.",
    "Each chapter has exercises and a playground.",
  ].join("\n");
  const result = verifyTutorialSource({ readme, treeEntries: [], topics: [] });
  assert.equal(result.ok, true);
  assert.equal(result.evidence, "readme-copy");
});

test("verifyTutorialSource rejects strong education with no AI signal", () => {
  const readme = [
    "# Interactive Vim Tutorial",
    "This course teaches lessons about text editing.",
    "Each chapter has exercises.",
  ].join("\n");
  const result = verifyTutorialSource({ readme, treeEntries: [], topics: [] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no AI\/ML signal/);
});

test("verifyTutorialSource accepts lesson structure even with thin README", () => {
  const readme = "# Deep Learning Exercises\nCourse repo.";
  const treeEntries = [
    { type: "blob", path: "chapter-01/intro.ipynb" },
    { type: "blob", path: "chapter-02/basics.ipynb" },
    { type: "blob", path: "chapter-03/models.ipynb" },
    { type: "blob", path: "README.md" },
  ];
  const result = verifyTutorialSource({ readme, treeEntries, topics: ["machine-learning"] });
  assert.equal(result.ok, true);
  assert.equal(result.evidence, "lesson-structure");
  assert.equal(result.lessonCount, 3);
});

test("isLessonPath ignores assets and dependency directories", () => {
  assert.equal(isLessonPath("01_setup.ipynb"), true);
  assert.equal(isLessonPath(".github/ISSUE_TEMPLATE/tutorial-request.md"), false);
  assert.equal(isLessonPath("PyTorch 101 Part 1 - Tensors.ipynb"), true);
  assert.equal(isLessonPath("lessons/lesson-2.md"), true);
  assert.equal(isLessonPath("chapter-04/training.py"), true);
  assert.equal(isLessonPath("node_modules/chapter-1/index.js"), false);
  assert.equal(isLessonPath("assets/hero.png"), false);
  assert.equal(isLessonPath("README.md"), false);
});

test("countLessonFiles ignores non-lesson files", () => {
  const entries = [
    { type: "blob", path: "week-1/notes.md" },
    { type: "blob", path: "README.md" },
    { type: "blob", path: "images/diagram.png" },
    { type: "tree", path: "week-1" },
  ];
  assert.equal(countLessonFiles(entries), 1);
});

test("evidenceLinesInText returns matching line numbers", () => {
  const text = ["header", "This course teaches prompt engineering.", "plain line", "Try the interactive tutorial here."].join("\n");
  assert.deepEqual(evidenceLinesInText(text, 2), [2, 4]);
});

test("mergeProject preserves human-reviewed editorial fields but refreshes metadata", () => {
  const existing = {
    id: "a/b",
    summarySource: "human-reviewed",
    plainSummary: "保留",
    category: "LLM 开发",
    tags: ["llm"],
    stars: 1,
  };
  const next = {
    summarySource: "source-extracted",
    plainSummary: "覆盖",
    category: "生成式 AI",
    tags: ["llm", "new"],
    stars: 5,
    forks: 2,
  };
  const merged = mergeProject(existing, next);
  assert.equal(merged.plainSummary, "保留");
  assert.equal(merged.category, "LLM 开发");
  assert.deepEqual(merged.tags, ["llm"]);
  assert.equal(merged.stars, 5);
  assert.equal(merged.forks, 2);
});

test("mergeProject allows machine summary for source-extracted entries", () => {
  const existing = { id: "a/b", summarySource: "source-extracted", plainSummary: "旧", tags: ["old"] };
  const next = { summarySource: "llm-reviewed", plainSummary: "新", tags: ["new"], stars: 9 };
  assert.equal(mergeProject(existing, next).plainSummary, "新");
});

test("findReadmeEntry prefers the shallowest README", () => {
  const entries = [
    { type: "blob", path: "docs/README.md" },
    { type: "blob", path: "a/b/readme.md" },
    { type: "tree", path: "docs" },
    { type: "blob", path: "examples/readme.rst" },
  ];
  assert.equal(findReadmeEntry(entries).path, "docs/README.md");
  assert.equal(findReadmeEntry([{ type: "blob", path: "Homework/readme.md" }, { type: "tree", path: "docs" }]).path, "Homework/readme.md");
});
