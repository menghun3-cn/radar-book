import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractReadmeSummary,
  createReviewer,
  normalizeModelsEndpoint,
  selectTextModel,
  discoverTextModel,
} from "./source-enrichment.mjs";
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

test("normalizeModelsEndpoint handles base, /v1, chat and models URLs", () => {
  assert.equal(normalizeModelsEndpoint("https://llm.example.com"), "https://llm.example.com/v1/models");
  assert.equal(normalizeModelsEndpoint("https://llm.example.com/v1"), "https://llm.example.com/v1/models");
  assert.equal(
    normalizeModelsEndpoint("https://llm.example.com/v1/chat/completions"),
    "https://llm.example.com/v1/models",
  );
  assert.equal(normalizeModelsEndpoint("https://llm.example.com/v1/models"), "https://llm.example.com/v1/models");
});

test("selectTextModel filters non-text models and prefers the newest chat model", () => {
  const model = selectTextModel([
    { id: "text-embedding-3-small", created: 12 },
    { id: "image-1", created: 13 },
    { id: "old-chat-plus", created: 10 },
    { id: "new-chat-2026", created: 11 },
  ]);
  assert.equal(model, "new-chat-2026");
});

test("discoverTextModel fetches /v1/models with auth and returns the selected id", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, headers: options.headers });
    return {
      ok: true,
      json: async () => ({
        data: [
          { id: "embedding-model", created: 1 },
          { id: "chat-latest", created: 5 },
          { id: "chat-2025", created: 3 },
        ],
      }),
    };
  };
  try {
    const model = await discoverTextModel({
      apiKey: "secret",
      endpoint: "https://llm.example.com/v1/chat/completions",
    });
    assert.equal(model, "chat-latest");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://llm.example.com/v1/models");
    assert.equal(calls[0].headers.Authorization, "Bearer secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createReviewer sends code source evidence and returns localized summaries", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              verified: true,
              confidence: 0.9,
              reason: "ok",
              category: "提示词工程",
              tags: ["tutorial"],
              plainSummary: "中文简介",
              plainSummaryEn: "English summary",
              plainSummaryJa: "日本語の要約",
              plainSummaryKo: "한국어 요약",
            }),
          },
        }],
      }),
    };
  };
  try {
    const reviewer = createReviewer({ apiKey: "k", endpoint: "https://llm.example/v1", model: "m", log: console });
    const review = await reviewer.reviewCandidate({
      repo: { full_name: "a/b" },
      readme: "# Tutorial\nLearn LLM.",
      taxonomy: { categories: [{ label: "LLM 开发" }] },
      codeSources: [{ path: "lesson/01.md", url: "https://github.com/a/b/blob/main/lesson/01.md", excerpt: "practice prompt patterns" }],
    });
    assert.equal(review.verified, true);
    assert.equal(review.plainSummaryEn, "English summary");
    assert.match(requests[0].messages[0].content, /lesson\/01\.md/);
    assert.match(requests[0].messages[0].content, /README 全文如下/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createReviewer falls back when LLM endpoint fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 502 });
  try {
    const reviewer = createReviewer({ apiKey: "k", endpoint: "https://llm.example/v1", model: "m", log: console });
    const review = await reviewer.reviewCandidate({ repo: { full_name: "a/b" }, readme: "course", taxonomy: {} });
    assert.equal(review.verified, null);
    assert.equal(review.reason, "llm-unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createReviewer retries once with a discovered model when the configured model is rejected", async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  const retryBodies = [];
  globalThis.fetch = async (url, options) => {
    call += 1;
    if (call === 1) {
      return {
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: { message: "model m does not exist" } }),
      };
    }
    if (call === 2) {
      assert.equal(url, "https://llm.example.com/v1/models");
      return {
        ok: true,
        json: async () => ({ data: [{ id: "chat-latest", created: 1 }] }),
      };
    }
    retryBodies.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ verified: true, confidence: 0.8, reason: "ok" }) } }],
      }),
    };
  };
  try {
    const reviewer = createReviewer({
      apiKey: "k",
      endpoint: "https://llm.example.com/v1/chat/completions",
      model: "configured-old",
      log: console,
    });
    const review = await reviewer.reviewCandidate({ repo: { full_name: "a/b" }, readme: "course", taxonomy: {} });
    assert.equal(review.verified, true);
    assert.equal(retryBodies.length, 1);
    assert.equal(retryBodies[0].model, "chat-latest");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createReviewer returns rejected review when LLM JSON is invalid", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: "not json" } }] }),
  });
  try {
    const reviewer = createReviewer({ apiKey: "k", endpoint: "https://llm.example/v1", model: "m", log: console });
    const review = await reviewer.reviewCandidate({ repo: { full_name: "a/b" }, readme: "course", taxonomy: {} });
    assert.equal(review.verified, false);
    assert.equal(review.plainSummary, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
