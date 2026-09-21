# AI Tutorial Radar

自动发现并维护 GitHub 上高价值的 **AI 教程 / 课程 / 交互式学习仓库** 目录站。项目参考 [Anthropic Prompt Engineering Interactive Tutorial](https://github.com/anthropics/prompt-eng-interactive-tutorial) 这类仓库形态，并按 awesome-radar-blueprint 的设计实现自动化扫描与发布流水线。

## 功能

- **JSON 即数据库**：`src/data/projects.json` 是唯一事实来源；每次变更进 git，可 diff、可审计、可回滚。
- **雷达自动发现**：18 组 GitHub Search 查询（repositories + code）按游标续扫，带预算、去重、黑名单与审计流水线。
- **收录闸门**：无 L2 LLM 评审时，雷达新发现的候选统一进入 `review-pending`，不会直接上线；人工复核后改为 `active` 并标记 `summarySource: curated` 防止被自动覆盖。
- **双层核验**：L1 在固定 commit 上做静态源码核验（README 教学信号 + 课程文件结构 + AI 主题）；可选 L2 LLM 评审门（OpenAI 兼容接口）。
- **编辑保护**：人工校审过的摘要、分类、标签、置顶标记不会被雷达刷新覆盖。
- **流水线闭环**：CI 测试 + 构建审计 → 每 6 小时雷达扫描 → 自动提交数据 → GitHub Pages 发布。
- **Issue 提交通道**：`ISSUE_TEMPLATE` 提交仓库，issue 事件自动执行 prepare → validate → CAS 原子提交 → 评论/关闭闭环。
- **多语言 SSG**：zh/en/ja/ko 四语言的首页、分类页、项目页全部预渲染，首屏与爬虫可读；客户端 hydrate 后保留筛选交互。
- **公开/内部分离**：发布前按字段白名单裁剪，审计脚本拒绝密钥、本地路径、内部目录与 source map 进入产物。

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173/radar-book/
npm test           # 回归测试
npm run build      # 数据裁剪 + 类型检查 + vite build + 四语言 SSG + CSP 注入 + 构建审计
```

首次初始化种子数据（需要 GitHub token）：

```bash
# 本地已登录 gh：
npm run bootstrap

# 或显式指定：
GITHUB_TOKEN=xxx npm run bootstrap
```

本地试跑雷达（dry-run 不写数据）：

```bash
GITHUB_TOKEN=xxx RADAR_MAX_PAGES=1 RADAR_MAX_CANDIDATES=3 npm run radar:dry
```

## 雷达环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `RADAR_GITHUB_TOKEN` / `GITHUB_TOKEN` | - | GitHub API token；code search 需要授权 |
| `RADAR_MAX_PAGES` | 2 | 每组查询每轮推进页数 |
| `RADAR_MAX_CANDIDATES` | 40 | 每轮核验候选上限，其余延后 |
| `RADAR_MIN_STARS` | 20 | 候选最低 star 数 |
| `RADAR_MIN_LESSONS` | 3 | 课程文件结构核验的最少文件数 |
| `RADAR_MODE` | `full` | `metadata-only` 只刷新已收录元数据 |
| `RADAR_SOURCES` | `repositories,code` | 可选查询通道 |
| `RADAR_REPOS` | - | 逗号分隔的显式复核候选，绕过扫描游标（适合人工复核或移除黑名单后验证） |
| `LLM_API_KEY` / `LLM_ENDPOINT` / `LLM_MODEL` | - | 可选 L2 评审门；也兼容 `MUSE_*` 别名 |

## 数据与目录

- `src/data/projects.json`：规范数据，含星级、许可证、固定 HEAD SHA、证据链接、核验状态。
- `src/data/radar.json`：每轮扫描报告（状态、来源、发现/拒绝/延后、数据指纹）。
- `radar/state.json`：搜索游标与 `checkedAt`，保证不重复扫同一个候选。
- `radar/exclusions.json`：被拒仓库黑名单，防止下一轮立刻捞回。
- `radar/receipts/`：每轮 audit 流水。
- `radar/queries.json`：搜索词配置（领域知识所在，可直接编辑）。
- `public/projects.json` 与 `public/meta.json`：构建时由白名单生成的公开数据。
- `public/llms.txt`：给 LLM/AI 阅读的目录索引。
- `src/data/site-content.json`：四语言站点文案与分类标签映射。
- `.github/ISSUE_TEMPLATE/project.yml`：Issue 提交通道表单。

## 核验规则（L1）

仓库必须公开、非 fork、未归档，且满足以下之一：

1. README 具备强教学信号（教程/课程/章节/练习/互动等词命中 >= 3）且包含 AI 主题信号；
2. 存在 >= 3 个课程类文件（lesson/chapter/numbered 目录下的 md/ipynb/py 等）且 README 或 topics 有教学或 AI 信号。

所有证据钉到具体 commit 的 blob URL；`verificationStatus: source-verified` 表示通过。

雷达通过 L1 但未配置 L2 LLM 时，候选会以 `catalogStatus: review-pending` 写进 `src/data/projects.json`，公开数据中的摘要显示为“待人工复核”；人工确认后把该记录改为 `active`。配置了 `LLM_*`/`MUSE_*` 且评审通过时可直接以 `llm-reviewed` 上线。

`LLM_ENDPOINT`/`MUSE_ENDPOINT` 支持 `https://host`、`https://host/v1`、`https://host/v1/chat/completions` 等写法，评审请求会自动规范化为 `/v1/chat/completions`。`*_MODEL` 未设置或配置模型被拒绝时，流水线会从 `/v1/models` 自动选取一个文生文模型重试。已处于 `review-pending` 的项目会在配置 L2 后的雷达同步中自动补跑评审，通过则转为 `active`，评审否决会进入黑名单。

## 流水线

| 工作流 | 触发 | 职责 |
|---|---|---|
| `check.yml` | push / PR | `npm test` + `npm run build` |
| `radar.yml` | 每 6 小时 / 手动 | 扫描、核验、原子落盘、有变更才提交 |
| `auto-ingest-issue.yml` | issue 打开/编辑、`/ingest` 评论、手动 | L1 + L2 核验、候选构建验证、CAS 原子提交、评论/关闭反馈闭环 |
| `deploy-pages.yml` | push master / 手动 | 构建、审计、上传 Pages artifact、部署 |

Pages 仓库设置里需要启用 GitHub Actions 部署，并把 `RADAR_GITHUB_TOKEN` 配置为带 `read:org`、`repo` 范围的 PAT。

`radar.yml` 有数据变更时会自动提交并 push master，然后主动 dispatch `deploy-pages.yml` 做构建、审计与 Pages 发布，全程不需要手动操作。

## 后续建议

- `close-pr.yml` 引导 PR 走 Issue 通道，避免两个写入口打架。
- 用 `workflow_run` 门禁在雷达一次收尾后再触发部署，减少逐个小提交部署。

## 参考

- awesome-radar-blueprint（本地参考文档，不进入仓库）
- [anthropics/prompt-eng-interactive-tutorial](https://github.com/anthropics/prompt-eng-interactive-tutorial)
