import { nowISO } from "./utils.mjs";

function extractJson(text) {
  const value = String(text ?? "").trim();
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : value;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function extractReadmeSummary(readme) {
  const text = String(readme ?? "")
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?::\w+|\.\w+|image::|video::|include::|ifdef::|ifndef::).*$/gm, "\n")
    .replace(/^#{1,6}\s.*$/gm, "\n")
    .replace(/^\s*(https?:\/\/|badge|img)/gim, "\n")
    .replace(/[>*|\-`]/g, " ")
    .replace(/[ \t]+/g, " ");
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 30);
  for (const paragraph of paragraphs) {
    const sentence = paragraph.split(/(?<=[。.!?])\s+/).find((item) => item.length >= 24);
    if (sentence) return truncate(sentence, 220);
  }
  return truncate(paragraphs[0] ?? text.trim().replace(/\s+/g, " "), 220);
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function normalizeModelsEndpoint(endpoint) {
  const raw = String(endpoint ?? "").trim();
  if (!raw) throw new Error("LLM endpoint is empty");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`invalid LLM endpoint: ${raw}`);
  }
  url.hash = "";
  let pathname = url.pathname.replace(/\/+$/, "");
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  const lower = last.toLowerCase();
  if (lower === "models") return url.href;
  if (lower === "chat" || lower === "completions") {
    pathname = pathname.replace(/(?:\/chat)?\/completions$/i, "");
  }
  if (/\/v1(?:\/models)?$/i.test(pathname)) {
    pathname = pathname.replace(/\/v1\/?$/, "/v1");
    pathname += "/models";
  } else {
    pathname += "/v1/models";
  }
  url.pathname = pathname;
  return url.href;
}

const NON_TEXT_PATTERNS = [
  /\bembedding/i,
  /\bimage/i,
  /\bimg\b/i,
  /\btts\b/i,
  /\bstt\b/i,
  /\bwhisper\b/i,
  /\b(?:re)?rerank(?:er)?\b/i,
  /\bmoderation\b/i,
  /\baudio\b/i,
  /\bvideo\b/i,
  /\bspeech\b/i,
  /\bdavinci\b/i,
];

function isNonTextModel(id) {
  return NON_TEXT_PATTERNS.some((pattern) => pattern.test(id));
}

function modelDateScore(id) {
  const match = String(id).match(/[-_](\d{4})(?:-(\d{2})|(\d{2}))(?:-(\d{2})|(\d{2}))?/);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2] ?? match[3] ?? 1);
  const day = Number(match[4] ?? match[5] ?? 1);
  if (year < 2019 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return 0;
  return year * 10_000 + month * 100 + day;
}

export function selectTextModel(models) {
  const candidates = (Array.isArray(models) ? models : [])
    .map((model) => ({ id: String(model?.id ?? "").trim(), created: Number(model?.created ?? 0) }))
    .filter((model) => model.id && !isNonTextModel(model.id));
  if (candidates.length === 0) return null;
  const score = (model) => {
    let score = 0;
    const id = model.id.toLowerCase();
    if (/\b(chat|gpt|qwen|deepseek|glm|text|instruct|generation|llm|model|muse|claude|mistral|llama)\b/.test(id)) score += 2;
    if (/\b(max|pro|ultra|turbo|latest)\b/.test(id)) score += 1;
    if (/\b(mini|small|tiny|nano|old|legacy|deprecated)\b/.test(id)) score -= 1;
    return score;
  };
  candidates.sort((a, b) => {
    const created = (b.created || modelDateScore(b.id)) - (a.created || modelDateScore(a.id));
    if (created !== 0) return created;
    const quality = score(b) - score(a);
    if (quality !== 0) return quality;
    return a.id.localeCompare(b.id);
  });
  return candidates[0].id;
}

export async function discoverTextModel({ apiKey, endpoint, log = console } = {}) {
  const modelsUrl = normalizeModelsEndpoint(endpoint);
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(modelsUrl, { headers });
  if (!response.ok) {
    throw new Error(`model list request failed: HTTP ${response.status} for ${modelsUrl}`);
  }
  const data = await response.json();
  const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  const model = selectTextModel(models);
  if (!model) throw new Error(`no text generation model found at ${modelsUrl}`);
  log.info?.(`[llm] discovered text model: ${model}`);
  return model;
}

function modelRejectedText(responseText) {
  if (!responseText) return false;
  try {
    const parsed = JSON.parse(responseText);
    const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? "";
    return String(message).length > 0;
  } catch {
    return /model[^"\n]{0,80}(not found|not exist|unsupported|invalid)/i.test(responseText);
  }
}

function buildReviewPrompt({ repo, readme, codeSources = [], taxonomy }) {
  return [
    "你是资料审核员。判断一个 GitHub 仓库是否值得收录进“AI 教程书籍/课程”目录。",
    "只有同时满足以下条件才返回 verified=true：",
    "1. 内容是教学性质（课程、教程、书籍、练习、互动学习），不是纯工具、示例集或普通文档；",
    "2. 内容围绕 AI/机器学习/LLM/提示工程/Agent/数据科学等主题；",
    "3. 结构上有成套章节或课程材料，而不只是一页 README。",
    "只输出 JSON，不要 markdown 代码块，字段：",
    '{"verified":boolean,"confidence":0到1,"reason":"不超过60字","category":"建议分类","tags":["最多4个英文标签"],"plainSummary":"不超过60字的中文一句话介绍","plainSummaryEn":"one English sentence","plainSummaryJa":"日本語の一言説明","plainSummaryKo":"한국어 한 줄 소개"}',
    `\n仓库：${repo.full_name}\n描述：${repo.description ?? ""}\nTopics：${(repo.topics ?? []).join(", ")}\n分类目录：${(taxonomy?.categories ?? []).map((c) => c.label).join("、")}`,
    `\n\n源码证据（固定 commit）：\n${codeSources.map((source, index) => `[${index + 1}] 路径：${source.path}\nURL：${source.url ?? ""}\n\n${String(source.excerpt ?? source.text ?? "").slice(0, 4_000)}`).join("\n\n") || "（无）"}`,
    `\n\nREADME 全文如下：\n${String(readme ?? "").slice(0, 18_000)}`,
  ].join("\n");
}

async function readErrorText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function buildReviewRequest({ apiKey, endpoint, model, prompt, signal }) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
    signal,
  };
}

export function createReviewer({ apiKey, endpoint, model, log = console } = {}) {
  if (!apiKey || !endpoint) return null;
  if (!model) log.warn?.("LLM model is not set; auto-discovery will happen on first candidate");

  async function request(model, prompt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(endpoint, buildReviewRequest({ apiKey, endpoint, model, prompt, signal: controller.signal }));
      if (!response.ok) {
        const errorText = await readErrorText(response);
        log.warn?.(`LLM review HTTP ${response.status}`);
        return { ok: false, status: response.status, errorText };
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? data?.content ?? "";
      return { ok: true, parsed: extractJson(content), content };
    } catch {
      return { ok: false, status: 0, errorText: "" };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async reviewCandidate({ repo, readme, codeSources = [], taxonomy }) {
      const prompt = buildReviewPrompt({ repo, readme, codeSources, taxonomy });
      let currentModel = model ?? null;
      let result = await request(currentModel, prompt);
      if (!result.ok && (result.status === 400 || result.status === 404) && modelRejectedText(result.errorText)) {
        const discovered = await discoverTextModel({ apiKey, endpoint, log });
        if (discovered !== currentModel) {
          log.info?.(`[llm] retrying ${repo.full_name} with discovered model ${discovered}`);
          result = await request(discovered, prompt);
        }
      }
      if (!result.ok) {
        log.warn?.(`LLM review ${repo.full_name}: HTTP ${result.status || "error"}`);
        return { verified: null, reason: "llm-unavailable", reviewedAt: nowISO() };
      }
      return {
        verified: result.parsed?.verified === true,
        confidence: Number(result.parsed?.confidence ?? 0),
        reason: result.parsed?.reason ?? "",
        category: result.parsed?.category ?? null,
        tags: Array.isArray(result.parsed?.tags) ? result.parsed.tags.slice(0, 4) : null,
        plainSummary: result.parsed?.plainSummary ?? null,
        plainSummaryEn: result.parsed?.plainSummaryEn ?? null,
        plainSummaryJa: result.parsed?.plainSummaryJa ?? null,
        plainSummaryKo: result.parsed?.plainSummaryKo ?? null,
        reviewedAt: nowISO(),
      };
    },
  };
}

export function reviewerConfig(env = process.env) {
  return {
    apiKey: env.LLM_API_KEY ?? env.MUSE_API_KEY,
    endpoint: env.LLM_ENDPOINT ?? env.MUSE_ENDPOINT,
    model: env.LLM_MODEL ?? env.MUSE_MODEL,
  };
}
