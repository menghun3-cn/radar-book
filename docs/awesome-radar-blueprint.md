# Awesome Jev 雷达站 —— 实现原理与仿制蓝图

> 本文档通过对 [logicrw/awesome-jev-projects](https://github.com/logicrw/awesome-jev-projects)(MIT License,Copyright (c) 2026 logicrw)源码的逐文件分析写成,目标是让读者**不开原仓库也能复刻同款功能**,或作为自建"自动同步目录/雷达站"的规格书。
>
> 如需直接参考源码,原仓库文件与本文档章节的对照表见文末附录 A。

---

## 0. 一句话总结

三层结构,缺一不可:

1. **JSON 文件即数据库** —— 没有后端服务,`src/data/projects.json` 是唯一事实来源
2. **两个自动入口写数据** —— (A) 用户提 GitHub Issue 自动入库;(B) 定时雷达扫描,用 GitHub 搜索 API 自动发现仓库,经双层核验后自动入库
3. **GitHub 全家桶闭环** —— Actions 定时/事件驱动 → CAS 原子提交回 main → 全量测试 + SSG 静态构建 → GitHub Pages 发布 → 上线确认

---

## 1. 系统全景与数据流

```
                        ┌──────────────────────────────────────────────┐
                        │              GitHub 仓库 (main)               │
                        │                                              │
                        │  radar/state.json          搜索游标/已查记录   │
                        │  radar/exclusions.json     黑名单(被拒仓库)    │
                        │  radar/receipts/           每次运行审计流水     │
                        │  radar/reviews/            人工复核记录         │
                        │  src/data/projects.json    ★ 规范数据(唯一     │
                        │                               事实来源,354条)  │
                        │  src/data/radar.json       扫描报告/统计       │
                        │  src/data/taxonomy.json    分类/标签目录表      │
                        │  src/data/sponsors.json    赞助商数据          │
                        └──────────▲─────────────────────▲─────────────┘
                                   │                     │
                    ┌──────────────┴─────────┐   ┌───────┴────────────────┐
                    │  通道二:雷达扫描         │   │  通道一:Issue 提交      │
                    │  radar.yml (每 6 小时)  │   │  auto-ingest-issue.yml │
                    │  ① GitHub Search API   │   │  ① prepare  静态核验    │
                    │     21组查询,游标续扫    │   │     + LLM 评审/多语言   │
                    │  ② 候选过滤/排序/预算    │   │  ② validate 候选数据    │
                    │  ③ L1 静态源码核验      │   │     全量构建验证         │
                    │  ④ L2 LLM 评审门       │   │  ③ publish CAS 原子提交 │
                    │  ⑤ 原子落盘 4 个 JSON   │   │  ④ acknowledge 上线确认 │
                    └───────────────────────┘   └────────────────────────┘
                                   │ 两路最终都推进 main 分支上的 ★projects.json
                                   ▼
              prepare-public-data.mjs  (publicFields 白名单裁剪,防泄密)
                                   ▼
              public/projects.json ──vite build──▶ dist/projects.json
                                   ▼
              build-static-site.mjs (Vite SSR 预渲染 4 语言:首页/分类页/项目页)
                                   ▼
              finalize-pages.mjs    (注入 CSP、生成 404.html、.well-known)
                                   ▼
              audit-build.mjs       (构建审计:密钥模式/链接/计数/字段白名单)
                                   ▼
              GitHub Pages  (deploy-pages.yml,publication-gate 校验触发来源)
```

---

## 2. 技术栈与关键决策

| 层 | 选型 | 说明 |
|---|---|---|
| 前端框架 | React 19 + TypeScript | 客户端交互(筛选/搜索/收藏/) |
| 构建 | Vite 7 + `@vitejs/plugin-react` | 产物带 hash + `crossorigin` 的经典 Vite 输出 |
| 样式 | Tailwind CSS 4 + 手写 `directory.css` | `@tailwindcss/vite` 插件 |
| 图标 | `lucide-react` | 内联 SVG,无需字体图标 |
| 字体 | `@fontsource-variable/inter`、`@fontsource-variable/jetbrains-mono` | 同源文件内嵌(`assetsInlineLimit: 0`),不用 data: URL,配合严格 font-src CSP |
| 静态生成 | 自研 `scripts/build-static-site.mjs` | 用 Vite SSR 模式(`vite.ssrLoadModule("/src/entry-server.tsx")`)把 React 渲染成 HTML |
| 数据库 | JSON 文件 | 无后端、无运行时依赖 |
| 自动化 | GitHub Actions | 5 个工作流(见 §8) |
| 托管 | GitHub Pages | `.nojekyll`、`actions/deploy-pages` |
| 统计 | Cloudflare Web Analytics | `analytics.js` + beacon,按 CSP connect-src 白名单放行 |
| LLM 能力 | MUSE 模型(经 `MUSE_*` 环境变量配置) | 做评审门 + 4 语言文案扩充,可选 |

**关键决策点(为什么这么做):**

| 决策 | 做法 | 收益 |
|---|---|---|
| 数据放代码仓库 | JSON 进 git | 每次变更留下完整历史,可 diff、可审计、可回滚 |
| 写库用 CAS | `PATCH refs/heads/main {force:false}` + parent 钉死审查时 SHA | 并发修改时安全拒绝,绝不 force 覆盖 |
| 不可变证据 | 证据 URL 一律钉到具体 commit hash | 核验结果可复现,README 后来改邪归正也不影响历史判断 |
| 双层核验 | L1 正则静态检查 + L2 LLM 评审门 | 正则抓"有嫌疑",LLM 抓"真集成",两者都过才收录 |
| 编辑保护 | 人写文案标 `summarySource: human-reviewed/curated/source-reviewed` | 元数据同步永不覆盖人工校审过的内容 |
| 零信任远端文本 | 提交的仓库内容只当数据读,从不执行 | 防止供应链注入 |
| 公开/内部分离 | `publicFields` 白名单 + 构建审计 | 内部字段(游标、hash、密钥模式)绝不进发布产物 |

---

## 3. 数据模型:`src/data/projects.json` 中一条记录

```jsonc
{
  // —— 身份与归属(入库时写入,周期同步不动)——
  "id": "browser-use:jev-ultrafast",          // owner:repo 小写,稳定 ID
  "name": "jev-ultrafast",
  "author": "browser-use",
  "url": "https://github.com/browser-use/jev-ultrafast",
  "repoId": 12345,                             // GitHub 仓库数字 ID,查重用
  "category": "Browser & OS Action",

  // —— 编辑文案(人工审校或 LLM 生成,4 语言后缀 En/Ja/Ko)——
  "plainSummary": "给浏览器一个目标,让 Jev 选择操作……",
  "plainSummaryEn": "...",
  "jevDecisionPoint": "根据当前 DOM,在一次请求里选择操作……",
  "highlightBenefit": "……",
  "claimStatus": "作者自测……",                 // 声明核实状态(不夸大)
  "tags": ["browser-automation", "typed-decisions"],

  // —— 元数据(每次雷达同步刷新)——
  "stars": 11544, "forks": 384, "openIssues": 36,
  "license": "MIT", "language": "Python",
  "createdAt": "...", "lastCommitAt": "...", "pushedAt": "...",
  "metadataFetchedAt": "...",
  "avatarUrl": "https://avatars.githubusercontent.com/u/...",
  "topics": [], "archived": false,

  // —— 核验证据(入库时写入)——
  "headSha": "1231850a0bf1a0c0341fe408ef1668dbbfdfac46",  // 固定版本 commit
  "sourceUrl": "https://github.com/.../blob/<sha>/jev_ultrafast/model.py",
  "sourcePath": "jev_ultrafast/model.py",       // Jev 集成源码文件
  "evidenceLines": [7, 18],                     // 命中的代码行
  "evidence": [{ "url": "…blob/<sha>/…", "note": "Fixed-commit source reviewed" }],
  "verificationStatus": "source-verified",      // source-verified | integration-detected
  "runtimeVerified": false,
  "summarySource": "human-reviewed",            // ★ 编辑保护标记
  "claimStatus": "……",
  "licenseStatus": "confirmed",                 // confirmed | declared | unconfirmed
  "sourceReviewedAt": "...",
  "catalogStatus": "active",                    // 可扩展: review-pending 等
  "pinned": true                                // 置顶种子项目(共 14 个)
}
```

**编辑保护规则(模拟时必须遵守):**

- 同步脚本里有 `PROTECTED_EDITORIAL_KEYS`(约 25 个字段:plainSummary 系列、jevDecisionPoint 系列、highlightBenefit 系列、category、tags、evidence、claimStatus 系列、sourceReviewedAt 等)
- 若 `summarySource ∈ {source-reviewed, human-reviewed, curated}`,元数据刷新**不覆盖**这些字段
- 被拒/隔离仓库写 `radar/exclusions.json`(带原因)和 `radar/reviews/`,防下一轮扫描立刻捞回

---

## 4. 通道一:人工提交(Issue Ingestion)

### 4.1 提交入口

`.github/ISSUE_TEMPLATE/project.yml` —— GitHub Issue 表单,字段:

| 字段 | 用途 |
|---|---|
| GitHub repository | 仓库链接或 owner/repo(必填) |
| What does it do? | 一句话用途 |
| Jev Primitives used | Choice / Score / Noul 多选(必填) |
| Primary Category | 17 个分类单选(必填) |
| Project Tags | 20 个标签多选(必填) |
| Where does Jev make a decision? | **源码证据链接**(如 `src/router.ts#L42`)(必填) |
| Submission Checklist | 公开/有许可证/同意自动核查 三个勾选 |

自动打上 `project-submission` 标签。另外 `close-pr.yml` 把一切 PR 自动关闭并指向 Issue 通道——**数据只走 Issue,不走 PR**,避免两个写入口打架。

### 4.2 工作流 `auto-ingest-issue.yml`(事件:issue opened/edited、issue_comment、workflow_dispatch)

```
review ─▶ validate ─▶ publish ─▶ (页面部署成功后) acknowledge
  │            │
  └─ rejected ─┴─▶ respond-feedback (发原因评论+打标签)
publish 失败且可重试 ─▶ record-retry (记录重试标记)
```

### 4.3 review:识别 + 核验 + 评审(`node scripts/issue-ingestion.mjs prepare`)

「是不是提交」三选一即算:`project-submission` 标签、标题以 `[project]` 开头、body 含 "项目仓库/GitHub repository" 头。

核验流水:

1. `extractSubmittedRepository` 从 body 提取仓库,正则校验 `owner/repo` 格式
2. **L1 静态核验** `inspectRepository`:
   - 必须公开、非 fork
   - 读取**指定 commit**(固定 SHA)的源码
   - `verifyIntegration` 正则启发式:同一源码文件里同时出现 **provider 接入** 与 **决策调用**,才算证据。正则示例:`api.typesafe.ai`、`from typesafe import`、`jev.choice|score|noul`、`TypeSafeClient|JevClient`、`TYPESAFE_API_KEY` 等。仅有 README 提及、依赖名、字符串常量都不算
3. **L2 LLM 评审** `createSubmissionReviewer`(MUSE 模型):对 `{repo, readme, codeSources, taxonomy}` 输出 `verified: true/false + confidence + reason + category + tags + plainSummary*`,补写 4 语言缺失文案
4. 产出**数据工件**(不改仓库):`ingestion-result.json`(评审明细)+ `candidate-projects.json`(待入库的整份 projects.json 候选版本),上传为 artifacts

### 4.4 validate:候选数据先行构建验证

- `workflow-data.mjs ingestion` 将 artifact 放到候选目录
- `npm ci --ignore-scripts`(只读安装,不执行钩子)
- `mos-self-heal.mjs validate` 校验候选数据 + 网站可构建性
- `ingestion-assets.mjs` 把校验通过的派生资产(头像等)绑定到候选

**核心思想:任何未知数据在进入正式仓库前,先用它把整个网站构建一遍,验证不会坏。**

### 4.5 publish:CAS 原子提交(`issue-ingestion.mjs publish`,真写 JSON 的动作)

要点(代码级):

```js
// 1. 复查:issue 仍是 open、body hash 未变、目标仓库仍是公开且 repoId 一致
// 2. dedup:existing.find(sameProject) —— sameProject 比较 id / repoId / 规范化 URL 任一
// 3. 构造新文件内容:纯粹"追加一条"
const candidateContent = JSON.stringify([...current, project], null, 2) + "\n";
// 4. 用 git objects API 造提交,父提交 = 审查时那个 SHA(reviewedSourceSha)
//    blobs(数据+头像资源) → trees(base_tree = 审查树的 sha) → commits
// 5. 比较-交换更新引用(核心防并发):
await api(`/repos/${repo}/git/refs/heads/main`,
  { method: "PATCH", body: { sha: createdCommit, force: false } });
//    —— main 在此期间被动过(409/422)就整体重试;绝不 force、绝不 rebase
```

commit message:`data: ingest owner/repo from #123`。

### 4.6 acknowledge:先上线,后确认

`deploy-pages.yml` 部署成功后才跑 `issue-ingestion.mjs acknowledge`:

- 用 `<!-- awesome-jev-ingestion:<issue>:<repoId> -->` 标记评论防重复
- 确认该条数据已出现在**已发布快照**中,才发 🎉 感谢并关闭 issue
- 拒绝的走 `respond-feedback` 发原因;可重试的 `record-retry` 标记,再由 `reconcile-ingestion.yml` 每半小时(`17,47 * * * *`)挑出重试队列,重新触发完整流程

---

## 5. 通道二:自动雷达扫描(Radar Sync)

工作流 `radar.yml`:`cron: 0 */6 * * *`(每 6 小时),`node scripts/radar-sync.mjs`。

### 5.1 运行预算(环境变量可调)

| 变量 | 默认 | 含义 |
|---|---|---|
| `RADAR_MAX_PAGES` | 2 | 每组查询每轮最多推进多少页 |
| `RADAR_MAX_CANDIDATES` | 60 | 每轮最多处理的候选仓库数 |
| `RADAR_SOURCES` | 全量 | `code` 时只做代码搜索 |
| `RADAR_MODE` | full | `metadata-only` 只刷新已收录元数据 |
| `GITHUB_TOKEN` | - | **代码搜索必须用有 code search 权限的 token** |
| `MUSE_API_KEY/ENDPOINT/MODEL` | - | L2 评审与文案扩充 |

### 5.2 搜索发现:21 组人写的查询,调 GitHub Search API

- **repositories ×13**(语法示例):`topic:jev fork:false`、`typesafe jev fork:false`、`typesafe-ai fork:false`、`jev-mcp fork:false`、`jev decision fork:false`、`"TypeSafe AI" in:readme fork:false`、`"Jev API" in:readme fork:false`、`topic:typesafe-ai fork:false`、`topic:typesafe ai fork:false`、`"api.typesafe.ai" in:readme fork:false`、`"typesafe.ai" "jev" in:readme fork:false`、`"from typesafe import jev" in:readme fork:false`、`"@typesafe/jev" in:readme fork:false`
- **code ×4**:`"api.typesafe.ai" in:file`、`"typesafe.ai" in:file`、`"from typesafe import" in:file`、`"@typesafe/jev" in:file` —— 命中文件 → `item.repository` + `item.path`(**path 就是后来 evidenceLines/sourcePath 的来源**)
- **commits ×2**:`"typesafe.ai"`、`"Jev" "AI"`
- **issues/PR ×2**:`"typesafe.ai" is:pr in:title,body`、`"Jev" "TypeSafe" is:pr in:title,body` —— 从 `item.repository_url` 还原仓库

### 5.3 游标续扫(避免重复劳动)

```js
const cursorKey = `${kind}:${q}`;
const firstPage = reviewState._searchCursors?.[cursorKey] ?? 1;
// 每页拉 100 条,page 从 firstPage 起最多扫 maxPages 页
// 扫完置回:page >= lastPage(或翻到第 10 页) ? 1 : page + 1
reviewState._searchCursors[cursorKey] = page >= lastPage ? 1 : page + 1;
```

GitHub 搜索可见上限 1000 条,所以 `total > 1000` 标记 `search-cap`,`firstPage > 1` 标记 `bounded` —— 报告里如实标注覆盖不全,不假装扫全了。

### 5.4 候选过滤 `add(repo, path)`

```
排除:repo 缺失 / private / fork / 在 exclusions.json / 已收录(byRepo 对账) / 本仓库自己
保留:命中路径记入 paths 集合(去重时合并)
```

### 5.5 排序与调度

```js
list.sort(按 checkedAt 最旧的优先 → 名字含 "jev" 优先 → stars 高优先)
处理前 maxCandidates 个,其余计为 deferred(留待下轮)
```

上一轮真实数据:1935 候选,查 60,拒 42,defer 1875——大部分生态是"排队慢慢扫"。

### 5.6 每候选的双层核验

```
L1 inspectRepository(静态):公开/非 fork/固定 SHA 源码上有
   provider 接入 + 决策调用(requireCodeEvidence: true) → 不过则 reject
L2 MUSE 评审门:reviewCandidate({repo, readme, codeSources, taxonomy})
   → verified === false 则 reject(记 confidence + reason)
通过 → summarize(repo, sourceText, taxonomy) → enrichCandidateSummary(LLM 补 4 语言)
构造 project 对象(含 headSha/sourceUrl/sourceHash/sourceVerification)
→ known.push(project)   // 内存数组
```

### 5.7 结束时原子落盘 4 个文件

| 文件 | 内容 |
|---|---|
| `src/data/projects.json` | 规范数据(整份数组,`atomicJSON` 临时文件+rename 覆盖) |
| `src/data/radar.json` | 本轮体检报告(见下) |
| `radar/state.json` | 搜索游标 + 每个仓库 `checkedAt` |
| `radar/receipts/<时间戳>.json` | 每候选 accept/reject/error 流水(审计) |

`radar.yml` 的 publish job 只在这几个文件 `git diff` 非空时 commit`data: refresh Jev ecosystem radar` 并 push。

### 5.8 radar.json 报告字段(读它就知道系统健康度)

```jsonc
{
  "status": "partial",                 // complete | partial | metadata-only
  "sources": [                         // 每组查询一行
    { "name": "repositories: topic:jev fork:false",
      "status": "bounded",             // ok | bounded | search-cap | partial | unavailable
      "count": 200, "total": 698, "pages": 2, "firstPage": 6 }
  ],
  "newProjects": 18,
  "metadata": { "ok": 336, "failed": 0 },
  "discovery": { "candidates": 1935, "checked": 60, "rejected": 42, "deferred": 1875 },
  "totalProjects": 354,
  "projectsSha256": "…",               // 数据指纹,可对账
  "runUrl": "https://github.com/…/actions/runs/…"
}
```

---

## 6. 从数据到网页

### 6.1 公开 vs 内部字段:`prepare-public-data.mjs`

`publicFields` 白名单(~49 个)会**主动丢弃**:`repoId`、`ingestion`、`sourceHash`、`sourceVerification`、`evidenceNote`、`metadataStatus`、`metadataError`、`runtimeVerified` 等内部字段。

`publicProse()` 同时过滤:路径泄露(`/Users/…`、`C:\`)、密钥模式(`github_pat_`、`sk-`、`AKIA`、`PRIVATE KEY`、`Bearer`)、代码块(import/def/function/```` ``` ````)等。`catalogStatus: review-pending` 的条目会替换为占位文案并标记 `license: null`。

> 一句话:**内部数据自己想留多少留多少,发布面只有白名单里的字段。**

### 6.2 构建链:`npm run build`

```
tsc -b                          # 类型检查
vite build                      # 常规前端产物;public/ 复制进 dist/
node scripts/build-static-site.mjs   # SSG:Vite SSR 预渲染所有页面
node scripts/finalize-pages.mjs      # 注入 CSP + 404.html + .well-known
node scripts/audit-build.mjs         # 构建审计(见下)
```

`build-static-site.mjs` 关键点:

- 读 `dist/projects.json`,用 `vite.ssrLoadModule("/src/entry-server.tsx")` 得到 `renderHome`
- 对 4 个 locale(zh/en/ja/ko)分别产出:首页、`catalog/`、每分类页、每项目页(全部是**静态 index.html**)
- 每个页面嵌入 `<script id="initial-projects" type="application/json">{locale, projects, day}</script>` 供前端 hydration —— 首屏有爬虫可读的完整内容,交互在客户端
- 每页生成 JSON-LD(`CollectionPage`/`ItemList`)、canonical、hreflang(5 处互链)

`finalize-pages.mjs`:`contentSecurityPolicy()` 自动计算所有内联 JSON 的 sha256 并写进 CSP;`secureHTML()` 拒绝任何可执行内联脚本;生成 `404.html`(SPA fallback);写 `.nojekyll`;同步 agent-skills(.well-known)。

`audit-build.mjs` 把关(模拟时建议全抄):

- 禁 source map;`radar/、receipts/、scripts/、.github/` 不得进入产物
- 全文扫描密钥模式与本地路径;CSS 禁 `data:font/`(保 font-src 'self')
- CSP 必须出现在所有 script/link 之前,且无 `'unsafe-eval'`
- 每个 HTML:唯一 canonical、5 处 hreflang、内联 script 只能是 JSON 且 hash 在 CSP 内
- 内部链接全部校验存在;`sitemap.xml`、banner、README、`llms.txt` 里的项目数与 `projects.json` 精确对齐
- 首页必须有渲染内容(不许空 `#root`)且含 `id="initial-projects"`;`radar.json` 禁止发布

### 6.3 多语言

`site-content.mjs`:`LOCALES = ["zh","en","ja","ko"]`,每语言一套 `COPY` 文案 + `suffix`(`En/Ja/Ko`)映射字段后缀。首版可只做一种语言,字段后缀机制保留即可。

---

## 7. 部署触发链(deploy-pages.yml)

```
on: push main / workflow_dispatch / workflow_run(radar 或 issue ingestion 完成)
   ↓
publication-gate:核对触发来源是否合法——
   workflow_run 必须是"对应工作流的真实写入步成功"
   (issue→step 'Append through an atomic main-branch commit'
    radar→step 'Publish data snapshot')   ← 防止任意 workflow 完成都触发部署
   ↓
build: npm ci → npm test → npm run build → tar + audit-pages-archive
   ↓
deploy: actions/deploy-pages
   ↓
acknowledge-submissions: 确认新数据真在线上,才给 issue 发 🎉 并关闭
```

花絮:官网部署的行为由 `.openai/hosting.json` 之类的配置也管着(原文仓库里有),说明其实有"AI 代管"实验成分——这是加分项,不是必需项。

---

## 8. 五个 GitHub Actions 工作流一览

| 文件 | 触发 | 职责 |
|---|---|---|
| `check.yml` | push main / PR | CI:`node --test scripts/*.test.mjs` + `npm run build` |
| `auto-ingest-issue.yml` | issue 事件 | 提交流水的 4+1 job(§4) |
| `radar.yml` | 每 6h / 手动 | 搜索发现 + 核验 + 落盘(§5) |
| `reconcile-ingestion.yml` | `17,47 * * * *` | 重试队列挑选,重跑 ingestion |
| `close-pr.yml` | PR opened | 关 PR 并引导走 Issue 通道 |
| `deploy-pages.yml` | push / workflow_run | 构建 + 发布 + 上线确认(§7) |

防并发手段:`concurrency: group + cancel-in-progress: false`(同组串行,不抢占)。

---

## 9. 值得抄的安全与稳健性清单(逐条原因)

1. **从不执行提交的仓库代码**;所有远端文本按不可信数据处理;依赖安装 `--ignore-scripts`
2. **写库 CAS**:`force: false` + 父提交钉死审查 SHA;冲突就重试,绝不强推
3. **原子写文件**:临时文件 + rename,进程中断不留半截 JSON
4. **不可变证据**:所有核验针对钉死的 commit SHA
5. **编辑保护**:人工/审校文案带 `summarySource` 标记,同步不覆盖
6. **双向对账**:扫描只推进游标不重扫;被拒仓库进 exclusions 防"捞尸"
7. **audit 门禁**:密钥/路径/链接/计数/字段白名单全量校验,过了才发布
8. **严格 CSP**:内联只允许 JSON(带 hash),字体同源,`upgrade-insecure-requests`
9. **发布前验证**:候选数据先构建整个网站;issue 回收确认在发布快照里
10. **可观测**:每轮 receipts + radar.json 报告 + 数据 SHA256 指纹

---

## 10. 仿制落地指南

### 10.1 最小目录骨架

```
your-awesome-radar/
├── index.html                  # Vite 入口
├── vite.config.ts              # base 改成你的 "/<repo>/",assetsInlineLimit: 0
├── tsconfig.json
├── package.json
├── .nojekyll
├── public/
│   ├── projects.json           # prepare-public-data 产出(发布用)
│   ├── directory.css           # 自定义样式
│   ├── theme-init.js           # 暗色主题前置脚本(可选)
│   ├── favicon.svg / og-card.png / robots.txt / sitemap.xml / llms.txt
│   └── .well-known/            # agent skills(可选)
├── src/
│   ├── main.tsx / App.tsx / entry-server.tsx
│   ├── styles.css
│   ├── data/
│   │   ├── projects.json       # ★ 规范数据(你唯一要维护的"库")
│   │   ├── radar.json          # 扫描报告
│   │   ├── taxonomy.json       # 分类/标签配置
│   │   └── sponsors.json       # 可选
│   ├── lib/                    # 搜索/过滤/i18n/安全 URL 等纯函数
│   └── components/             # UI 组件
├── radar/
│   ├── state.json              # 搜索游标 + 已查记录(自动维护)
│   ├── exclusions.json         # 黑名单(手动维护)
│   ├── receipts/               # 每轮审计(自动维护)
│   └── reviews/                # 人工复核记录
├── scripts/
│   ├── github-client.mjs       # GitHub API 封装(重试/限流/搜索)
│   ├── project-source.mjs      # 仓库检查/证据提取
│   ├── radar-sync.mjs          # 扫描主程序
│   ├── issue-ingestion.mjs     # 提交流水主程序
│   ├── source-enrichment.mjs   # LLM 评审与扩充
│   ├── prepare-public-data.mjs # 字段白名单裁剪
│   ├── build-static-site.mjs   # SSG
│   ├── finalize-pages.mjs      # CSP/404/.well-known
│   ├── audit-build.mjs         # 构建审计
│   └── *.test.mjs              # 每个脚本配测试(原项目 30+ 个)
└── .github/
    ├── ISSUE_TEMPLATE/project.yml
    └── workflows/  (check / auto-ingest-issue / radar / reconcile-ingestion / close-pr / deploy-pages)
```

### 10.2 package.json scripts(照抄)

```jsonc
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build && node scripts/build-static-site.mjs && node scripts/finalize-pages.mjs && node scripts/audit-build.mjs",
    "preview": "vite preview --host 127.0.0.1",
    "test": "node --test scripts/*.test.mjs",
    "build:readme": "node scripts/generate-readme.mjs"
  }
}
```

### 10.3 Secrets / 环境变量清单(仓库 Settings → Secrets and variables)

| 变量 | 必填? | 用途 |
|---|---|---|
| `RADAR_GITHUB_TOKEN`(或 GITHUB_TOKEN) | 是 | 搜索 API(尤其 code search),限流配额 |
| `MUSE_API_KEY` + `MUSE_ENDPOINT` + `MUSE_MODEL` | 可选 | L2 评审门 + 多语言扩充;没有则退回纯静态核验 |
| 工作流内 `RADAR_MAX_PAGES`、`RADAR_MAX_CANDIDATES` 等 | 可选 | 扫描预算 |
| Pages 环境 | 是 | Settings → Pages → 选 GitHub Actions 部署 |

### 10.4 分阶段实施(每阶段可独立上线)

| 阶段 | 内容 | 交付物 |
|---|---|---|
| P0 | 静态目录站:React+Vite+Tailwind,读 `src/data/projects.json` 渲染 | 网站本身,手动改 JSON 也能发版 |
| P1 | `prepare-public-data` + SSG 多语言 + `finalize-pages` + `audit-build`;`check.yml` + `deploy-pages.yml` | 全自动构建发布,数据一改即上线 |
| P2 | Issue 通道:`ISSUE_TEMPLATE` + `auto-ingest-issue.yml` + CAS publish | 用户提 issue 自动收录 |
| P3 | 雷达扫描:`radar-sync` + 21 组查询 + 游标 + receipts + `radar.yml` | 无人值守自动发现(先 P2 后 P3,人或 LLM 文案还没就绪时靠扫描兜底) |
| P4 | L2 LLM 评审门 + 4 语言扩充 + `reconcile-ingestion` 重试队列 | 全自动闭环 |

### 10.5 拷贝改造时的替换点清单

- `vite.config.ts` 的 `base` → 你的 `/<仓库名>/`
- `site-content.mjs` 的 `SITE / BASE / REPOSITORY / LOCALES` → 你的域名/仓库/语言
- `radar-sync.mjs` 里的 21 组搜索词 → 你的生态关键词(这是"领域知识"所在)
- `taxonomy.json` 的分类/标签 → 你的目录维度
- 所有 GitHub 仓库名路径 → 你的仓库
- `audit-build.mjs` 里的钉子(如"14 个 pinned 种子") → 改成你的数量

---

## 附录 A:源码对照表(按需查阅原仓库)

| 本文档章节 | 原仓库文件 |
|---|---|
| §1/§6.2 构建 | `scripts/build-static-site.mjs`、`scripts/finalize-pages.mjs`、`scripts/audit-build.mjs`、`vite.config.ts`、`package.json` |
| §3 数据模型 | `src/data/projects.json`(前几条)、`scripts/prepare-public-data.mjs`、`scripts/radar-sync.mjs`(PROTECTED_EDITORIAL_KEYS) |
| §4 Issue 通道 | `.github/ISSUE_TEMPLATE/project.yml`、`.github/workflows/auto-ingest-issue.yml`、`scripts/issue-ingestion.mjs`、`scripts/source-enrichment.mjs` |
| §5 雷达扫描 | `.github/workflows/radar.yml`、`scripts/radar-sync.mjs` |
| §6.1 公开裁剪 | `scripts/prepare-public-data.mjs` |
| §6.3 多语言 | `scripts/site-content.mjs` |
| §7/§8 部署 | `.github/workflows/deploy-pages.yml`、`check.yml`、`reconcile-ingestion.yml`、`close-pr.yml` |
| §10 骨架 | 仓库根目录结构 |

---

*文档基于 2026-09 月的仓库快照分析;原项目持续演进,以 [GitHub 仓库](https://github.com/logicrw/awesome-jev-projects)(MIT)为准。*
