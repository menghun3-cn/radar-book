import { test } from "node:test";
import assert from "node:assert/strict";
import { extractReadmeSummary } from "./source-enrichment.mjs";
import { findAiCategory } from "./project-source.mjs";

test("extractReadmeSummary strips html and badges before choosing a sentence", () => {
  const summary = extractReadmeSummary(
    [
      '# PyTorch Tutorials',
      '<p align="center"><img width="40%" src="logo.png" /></p>',
      'This repository provides tutorial code for deep learning researchers to learn PyTorch.',
      'It covers CNN, RNN and GAN examples.',
    ].join("\n"),
  );
  assert.ok(!summary.includes("<p"));
  assert.ok(!summary.includes("<img"));
  assert.match(summary, /tutorial code for deep learning researchers/);
});

test("extractReadmeSummary skips asciidoc directive noise", () => {
  const summary = extractReadmeSummary(
    [
      'image::https://travis-ci.org/instillai/TensorFlow-Course.svg?branch=master',
      ':target: https://travis-ci.org/instillai/TensorFlow-Course',
      '..',
      'TensorFlow Course teaches deep learning from regression to GANs.',
    ].join("\n"),
  );
  assert.match(summary, /TensorFlow Course teaches deep learning/);
  assert.ok(!summary.includes("image::"));
});

test("findAiCategory prefers the dominant subject", () => {
  assert.equal(
    findAiCategory(
      "TensorFlow Course for deep learning. Learn CNN, RNN and neural networks.",
      [],
      "instillai/tensorflow-course",
    ),
    "深度学习",
  );
  assert.equal(
    findAiCategory(
      "An interactive prompt engineering guide. Learn prompt patterns and design.",
      ["ai"],
      "a/b",
    ),
    "提示词工程",
  );
  assert.equal(
    findAiCategory(
      "A book about building LLM applications with agents and RAG.",
      [],
      "c/d",
    ),
    "LLM 开发",
  );
});
