const EDUCATION_TERMS = [
  "tutorial",
  "course",
  "lesson",
  "chapter",
  "learn",
  "guide",
  "exercise",
  "interactive",
  "cookbook",
  "book",
  "workshop",
  "curriculum",
  "playground",
  "notebook",
];

const AI_TERMS = [
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "llm",
  "large language model",
  "neural",
  "prompt",
  "generative ai",
  "generative artificial intelligence",
  "rag",
  "agent",
  "transformer",
  "gpt",
  "claude",
  "llama",
  "pytorch",
  "tensorflow",
  "jax",
  "huggingface",
  "openai",
  "fine-tun",
  "diffusion",
  "tokenizer",
  "data science",
  "reinforcement learning",
  "computer vision",
  "natural language",
  "nlp",
  "genai",
];

const LESSON_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdx",
  ".qmd",
  ".ipynb",
  ".py",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".rst",
]);

const IGNORED_PATH_FRAGMENTS = [
  "/.git/",
  "/node_modules/",
  ".git/",
  ".github/",
  "node_modules/",
  "/.github/",
  "/.venv/",
  "/venv/",
  "/site-packages/",
  "/dist/",
  "/build/",
  "/__pycache__/",
  "/img/",
  "/images/",
  "/assets/",
  "/fonts/",
  "/.vscode/",
];

export const PROTECTED_EDITORIAL_KEYS = [
  "plainSummary",
  "category",
  "tags",
  "evidence",
  "claimStatus",
  "summarySource",
  "sourceReviewedAt",
  "pinned",
];

function matchTerms(text, terms) {
  const lower = String(text ?? "").toLowerCase();
  const re = new RegExp(`\\b(${terms.join("|")})\\b`, "gi");
  const hits = new Set();
  let m;
  while ((m = re.exec(lower)) !== null) {
    hits.add(m[0].toLowerCase());
  }
  return hits;
}

export function isAiTopic(topic) {
  const lower = String(topic ?? "").toLowerCase();
  return AI_TERMS.some((term) => lower.includes(term));
}

export function isLessonPath(entryPath) {
  const p = String(entryPath ?? "").toLowerCase();
  for (const fragment of IGNORED_PATH_FRAGMENTS) {
    if (p.includes(fragment)) return false;
  }
  const extensionMatch = p.match(/\.([a-z0-9]+)$/);
  if (!extensionMatch || !LESSON_EXTENSIONS.has(`.${extensionMatch[1]}`)) return false;
  return (
    /(^|\/)(part|lesson|chapter|course|tutorial|unit|week|exercise|homework|assignment|notebook)s?([/_ -]|$)/.test(p) ||
    /(^|\/|\s)part\s+\d+/.test(p) ||
    /(^|\/)\d{1,3}[-_ ]/.test(p)
  );
}

export function countLessonFiles(treeEntries) {
  if (!Array.isArray(treeEntries)) return 0;
  return treeEntries.filter((entry) => entry.type === "blob" && isLessonPath(entry.path)).length;
}

export function lessonFilePaths(treeEntries) {
  return treeEntries
    .filter((entry) => entry.type === "blob" && isLessonPath(entry.path))
    .map((entry) => entry.path)
    .slice(0, 5);
}

export function findReadmeEntry(treeEntries) {
  const entries = Array.isArray(treeEntries) ? treeEntries : [];
  const candidates = entries
    .filter((entry) => entry.type === "blob" && /(^|\/)readme\.(md|markdown|txt|rst|mdx|qmd)$/i.test(entry.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  return candidates[0] ?? null;
}

export function evidenceLinesInText(text, maxLines = 8) {
  const lines = String(text ?? "").split(/\r?\n/);
  const hits = [];
  const allTerms = [...EDUCATION_TERMS, ...AI_TERMS];
  const re = new RegExp(`\\b(${allTerms.join("|")})\\b`, "gi");
  lines.forEach((line, index) => {
    if (hits.length >= maxLines) return;
    re.lastIndex = 0;
    if (re.test(line)) hits.push(index + 1);
  });
  return hits;
}

export function verifyTutorialSource({ readme, treeEntries, topics, minLessons = 3 }) {
  const educationHits = matchTerms(readme, EDUCATION_TERMS);
  const aiHits = matchTerms(readme, AI_TERMS);
  const topicHits = (topics ?? []).filter(isAiTopic);
  const lessonCount = countLessonFiles(treeEntries);

  const strongReadme = educationHits.size >= 3 && (aiHits.size >= 1 || topicHits.length >= 1);
  const strongStructure =
    lessonCount >= minLessons && (aiHits.size >= 1 || topicHits.length >= 1 || educationHits.size >= 1);

  if (strongReadme || strongStructure) {
    return {
      ok: true,
      educationHits: [...educationHits],
      aiHits: [...aiHits],
      lessonCount,
      evidence: strongStructure ? "lesson-structure" : "readme-copy",
    };
  }

  const reasons = [];
  if (educationHits.size < 3 && lessonCount < minLessons) {
    reasons.push(`education signal too weak (${educationHits.size} readme terms, ${lessonCount} lesson files)`);
  }
  if (aiHits.size < 1 && topicHits.length < 1) {
    reasons.push("no AI/ML signal");
  }
  return {
    ok: false,
    educationHits: [...educationHits],
    aiHits: [...aiHits],
    lessonCount,
    reason: reasons.join("; "),
  };
}

export function findAiCategory(text, topics, fullName = "") {
  const haystack = `${String(text ?? "").toLowerCase()} ${(topics ?? []).join(" ").toLowerCase()}`;
  const name = String(fullName ?? "").toLowerCase();
  const rules = [
    ["prompt engineering", "提示词工程", 3],
    ["prompt", "提示词工程", 1],
    ["reinforcement learning", "强化学习", 3],
    ["data science", "数据科学", 3],
    ["generative ai", "生成式 AI", 3],
    ["genai", "生成式 AI", 2],
    ["diffusion", "生成式 AI", 2],
    ["large language model", "LLM 开发", 3],
    ["llm", "LLM 开发", 2],
    ["fine-tun", "LLM 开发", 2],
    ["rag", "LLM 开发", 2],
    ["ai engineering", "LLM 开发", 2],
    ["deep learning", "深度学习", 3],
    ["pytorch", "深度学习", 2],
    ["tensorflow", "深度学习", 2],
    ["keras", "深度学习", 1.5],
    ["neural network", "深度学习", 1.5],
    ["machine learning", "机器学习", 1.5],
    ["sklearn", "机器学习", 1.5],
    ["agent", "AI Agent", 1.5],
    ["gpt", "LLM 开发", 1.5],
    ["claude", "LLM 开发", 1.5],
    ["llama", "LLM 开发", 1.5],
    ["openai", "LLM 开发", 1],
    ["huggingface", "LLM 开发", 1],
    ["transformers", "LLM 开发", 1.5],
  ];
  const scores = new Map();
  for (const [needle, category, weight] of rules) {
    const count = haystack.split(needle).length - 1 + (name.includes(needle) ? 1 : 0);
    if (count > 0) scores.set(category, (scores.get(category) ?? 0) + weight * Math.min(count, 5));
  }
  if (scores.size === 0) return "LLM 实战";
  const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 1.5 ? best[0] : "机器学习";
}

export function mapTopicsToTags(topics, allowedTags) {
  const lowerTopics = (topics ?? []).map((t) => t.toLowerCase());
  const tags = new Set();
  for (const tag of allowedTags) {
    if (lowerTopics.some((topic) => topic.includes(tag) || tag.includes(topic))) tags.add(tag);
  }
  return [...tags];
}

export async function inspectRepository(client, repo, { minLessons = 3 } = {}) {
async function collectCodeSources(client, fullName, headSha, repo, treeEntries) {
  const sources = [];
  for (const lessonPath of lessonFilePaths(treeEntries).slice(0, 2)) {
    try {
      const text = await client.getFileText(fullName, lessonPath, headSha);
      if (!text) continue;
      sources.push({
        path: lessonPath,
        url: `${repo.html_url}/blob/${headSha}/${lessonPath}`,
        excerpt: text.slice(0, 4_000),
      });
    } catch {
      // Code evidence is best-effort; README review still proceeds.
    }
  }
  return sources;
}

  const fullName = repo.full_name ?? `${repo.owner}/${repo.name}`;
  const problems = [];
  if (repo.private) problems.push("private");
  if (repo.fork) problems.push("fork");
  if (repo.archived) problems.push("archived");
  if (repo.disabled) problems.push("disabled");
  if (problems.length) {
    return { ok: false, reason: problems.join(", "), stage: "repo-gate" };
  }

  const branch = repo.default_branch;
  if (!branch) {
    return { ok: false, reason: "no default branch", stage: "repo-gate" };
  }

  const headSha = await client.getBranchHead(fullName, branch);
  if (!headSha) {
    return { ok: false, reason: "cannot resolve default branch HEAD", stage: "source" };
  }

  let treeEntries = [];
  let treeTruncated = false;
  let treeUnavailable = false;
  try {
    const tree = await client.getTree(fullName, headSha);
    treeEntries = tree.tree ?? [];
    treeTruncated = Boolean(tree.truncated);
  } catch {
    treeUnavailable = true;
  }

  let readmeEntry = findReadmeEntry(treeEntries);
  let readmeText = null;
  if (readmeEntry) {
    readmeText = await client.getFileText(fullName, readmeEntry.path, headSha);
  }
  if (!readmeText) {
    try {
      const rootEntries = await client.getContents(fullName, "", headSha);
      if (Array.isArray(rootEntries)) {
        readmeEntry = findReadmeEntry(rootEntries);
        if (readmeEntry) readmeText = await client.getFileText(fullName, readmeEntry.path, headSha);
      }
    } catch {
      // Keep the verification failure below.
    }
  }
  if (!readmeText) {
    return { ok: false, reason: "no readable README", stage: "source" };
  }

  const verification = verifyTutorialSource({
    readme: readmeText,
    treeEntries,
    topics: repo.topics ?? [],
    minLessons,
  });
  if (!verification.ok) {
    return { ok: false, reason: verification.reason, stage: "l1" };
  }

  return {
    ok: true,
    headSha,
    readmeText,
    sourcePath: readmeEntry.path,
    evidenceLines: evidenceLinesInText(readmeText),
    lessonPaths: lessonFilePaths(treeEntries),
    codeSources: await collectCodeSources(client, fullName, headSha, repo, treeEntries),
    lessonCount: verification.lessonCount,
    treeUnavailable,
    treeTruncated,
    educationHits: verification.educationHits,
    aiHits: verification.aiHits,
  };
}

export function mergeProject(existing, next) {
  const editorialProtected = Boolean(
    existing &&
      ["human-reviewed", "curated", "source-reviewed"].includes(existing.summarySource),
  );
  const merged = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(next)) {
    if (editorialProtected && PROTECTED_EDITORIAL_KEYS.includes(key)) continue;
    merged[key] = value;
  }
  return merged;
}
