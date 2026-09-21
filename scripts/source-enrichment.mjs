import { nowISO, sleep } from "./utils.mjs";

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

export function createReviewer({ apiKey, endpoint, model, log = console } = {}) {
  if (!apiKey || !endpoint || !model) return null;
  return {
    async reviewCandidate({ repo, readme, codeSources = [], taxonomy }) {
      const prompt = [
        "你是资料审核员。判断一个 GitHub 仓库是否值得收录进“AI 教程书籍/课程”目录。",
        "只有同时满足以下条件才返回 verified=true：",
        "1. 内容是教学性质（课程、教程、书籍、练习、互动学习），不是纯工具、示例集或普通文档；",
        "2. 内容围绕 AI/机器学习/LLM/提示工程/Agent/数据科学等主题；",
        "3. 结构上有成套章节或课程材料，而不只是一页 README。",
        "只输出 JSON，不要 markdown 代码块，字段：",
        '{"verified":boolean,"confidence":0到1,"reason":"不超过60字","category":"建议分类","tags":["最多4个英文标签"],"plainSummary":"不超过60字的中文一句话介绍","plainSummaryEn":"one English sentence","plainSummaryJa":"日本語の一言説明","plainSummaryKo":"한국어 한 줄 소개"}',
        `\n仓库：${repo.full_name}\n描述：${repo.description ?? ""}\nTopics：${(repo.topics ?? []).join(", ")}\n分类目录：${(taxonomy?.categories ?? []).map((c) => c.label).join("、")}`,
        `\n\n源码证据（固定 commit）：\n${codeSources.map((source, index) => `[${index + 1}] 路径：${source.path}\nURL：${source.url ?? ""}\n\n${String(source.excerpt ?? source.text ?? "").slice(0, 4_000)}`).join("\n\n") || "（无）"}`,
        `\n\README 全文如下：\n${String(readme ?? "").slice(0, 18_000)}`,
      ].join("\n");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      try {
        const response = await fetch(endpoint, {
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
          signal: controller.signal,
        });
        if (!response.ok) {
          log.warn?.(`LLM review ${repo.full_name}: HTTP ${response.status}`);
          return { verified: null, reason: "llm-unavailable", reviewedAt: nowISO() };
        }
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? data?.content ?? "";
        const parsed = extractJson(content);
        return {
          verified: parsed?.verified === true,
          confidence: Number(parsed?.confidence ?? 0),
          reason: parsed?.reason ?? "",
          category: parsed?.category ?? null,
          tags: Array.isArray(parsed?.tags) ? parsed.tags.slice(0, 4) : null,
          plainSummary: parsed?.plainSummary ?? null,
          plainSummaryEn: parsed?.plainSummaryEn ?? null,
          plainSummaryJa: parsed?.plainSummaryJa ?? null,
          plainSummaryKo: parsed?.plainSummaryKo ?? null,
          reviewedAt: nowISO(),
        };
      } catch {
        return { verified: null, reason: "llm-unavailable", reviewedAt: nowISO() };
      } finally {
        clearTimeout(timer);
      }
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
