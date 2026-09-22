import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { readJSON } from "./utils.mjs";
import { copyFor, localeMeta, categoryLabelFor, localizedPagePath, projectSummaryFor, projectRouteSlug, LOCALES } from "./site-content.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(ROOT, "dist");
const TAXONOMY_PATH = path.join(ROOT, "src", "data", "taxonomy.json");
const INDEX_TEMPLATE_PATH = path.join(DIST_DIR, "index.html");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function fullCopy(locale) {
  const content = readJSON(path.join(ROOT, "src", "data", "site-content.json"));
  const copy = { ...content.copy[locale] };
  copy.categoryLabels = {};
  for (const [key, labels] of Object.entries(content.categoryLabels)) {
    copy.categoryLabels[key] = labels[locale] ?? labels.zh ?? key;
  }
  copy.contentTypeLabels = {};
  for (const [key, labels] of Object.entries(content.contentTypeLabels)) {
    copy.contentTypeLabels[key] = labels[locale] ?? labels.zh ?? key;
  }
  copy.technologyLabels = {};
  for (const [key, labels] of Object.entries(content.technologyLabels)) {
    copy.technologyLabels[key] = labels[locale] ?? labels.zh ?? key;
  }
  return copy;
}

function localePrefix(locale) {
  return locale === "zh" ? "" : `/${locale}`;
}

function pageTitle(kind, copy, category, project) {
  if (kind === "project" && project) return `${project.name} | AI Tutorial Radar`;
  if (kind === "category" && category) return `${category} | AI Tutorial Radar`;
  if (kind === "catalog") return "Catalog | AI Tutorial Radar";
  return `${copy.heroTitle} | AI Tutorial Radar`;
}

function pageDescription(kind, copy, category, project, locale) {
  if (kind === "project" && project) return projectSummaryFor(project, locale) || copy.heroSub;
  if (kind === "category" && category) return `${copy.heroSub} ${category}`;
  return copy.heroSub;
}


function injectSeoLinks(html, siteUrl, pagePath, locale) {
  if (!siteUrl) return html;
  const alternates = LOCALES
    .filter((item) => item !== locale)
    .map((item) => {
      const linkedPath = localizedPagePath(pagePath, item);
      return `<link rel="alternate" hreflang="${item}" href="${siteUrl}${linkedPath}" />`;
    })
    .join("\n    ");
  const self = localeMeta(locale);
  const canonical = `${siteUrl}${pagePath}`;
  const block = `<link rel="canonical" href="${canonical}" />${alternates ? `\n    ${alternates}` : ""}\n    <link rel="alternate" hreflang="x-default" href="${siteUrl}/" />\n    <link rel="alternate" hreflang="${self.htmlLang.replace("-", "-")}" href="${canonical}" />`;
  const marker = "<!-- ai-radar-seo-links -->";
  if (html.includes(marker)) return html.replace(marker, block);
  return html.replace("</head>", `    <!-- ai-radar-seo-links -->${block}\n  </head>`);
}

async function main() {
  if (!fs.existsSync(INDEX_TEMPLATE_PATH)) {
    throw new Error("dist/index.html not found; run vite build first");
  }
  const projects = readJSON(path.join(DIST_DIR, "projects.json"));
  const meta = readJSON(path.join(DIST_DIR, "meta.json"));
  const taxonomy = readJSON(TAXONOMY_PATH);
  const template = fs.readFileSync(INDEX_TEMPLATE_PATH, "utf8");
  const siteUrl = String(process.env.SITE_URL ?? "https://menghun3-cn.github.io/radar-book").trim().replace(/\/+$/, "");
  const vite = await createServer({
    root: ROOT,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });

  try {
    const { renderApp } = await vite.ssrLoadModule("/src/entry-server.tsx");
    const pages = [];
    const sitemap = [];

    for (const locale of LOCALES) {
      const copy = fullCopy(locale);
      const metaInfo = localeMeta(locale);
      const prefix = localePrefix(locale);
      const basePath = prefix ? `${prefix}/` : "/";

      const homeRoutes = [
        { kind: "home", path: basePath, rel: `${prefix}/index.html`, title: pageTitle("home", copy), description: pageDescription("home", copy, null, null, locale), pageKind: undefined },
        { kind: "catalog", path: `${basePath}catalog/`, rel: `${prefix}/catalog/index.html`, title: pageTitle("catalog", copy), description: pageDescription("catalog", copy, null, null, locale), pageKind: { category: "all" } },
      ];

      const categoryRoutes = taxonomy.categories
        .filter((item) => item.id !== "all")
        .map((item) => {
          const label = categoryLabelFor(item.id, locale);
          return {
            kind: "category",
            category: item.id,
            path: `${basePath}categories/${encodeURIComponent(item.id)}/`,
            rel: `${prefix}/categories/${encodeURIComponent(item.id)}/index.html`,
            title: pageTitle("category", copy, label),
            description: pageDescription("category", copy, label, null, locale),
            pageKind: { category: item.id },
          };
        });

      const projectRoutes = projects.map((project) => {
        const slug = projectRouteSlug(project);
        return {
          kind: "project",
          project,
          path: `${basePath}projects/${slug}/`,
          rel: `${prefix}/projects/${slug}/index.html`,
          title: pageTitle("project", copy, null, project),
          description: pageDescription("project", copy, null, project, locale),
          pageKind: { projectId: project.id },
        };
      });

      for (const route of [...homeRoutes, ...categoryRoutes, ...projectRoutes]) {
        const initialData = {
          locale,
          copy,
          projects: route.project ? [route.project] : projects,
          meta,
          page: route.pageKind,
        };
        const appHtml = renderApp(initialData);
        const json = escapeJson(initialData);
        let html = template
          .replace('<html lang="zh-CN">', `<html lang="${metaInfo.htmlLang}">`)
          .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`)
          .replace(
            /<meta name="description"[^>]*>/,
            `<meta name="description" content="${escapeHtml(route.description)}" />`,
          )
          .replace(
            '<div id="root"></div>',
            `<div id="root">${appHtml}</div>\n    <script id="initial-projects" type="application/json">${json}</script>`,
          );
        if (!html.includes('<meta name="description"')) {
          html = html.replace("</head>", `    <meta name="description" content="${escapeHtml(route.description)}" />\n  </head>`);
        }
        html = injectSeoLinks(html, siteUrl, route.path, locale);

        const outputPath = path.join(DIST_DIR, route.rel);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, html, "utf8");
        pages.push({ rel: route.rel, locale, kind: route.kind });
        sitemap.push({ path: route.path, locale });
      }
    }

    const sitemapXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...sitemap.map((item) => {
        const href = siteUrl ? `${siteUrl}${item.path}` : item.path;
        return `  <url><loc>${escapeHtml(href)}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>`;
      }),
      "</urlset>",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), sitemapXml, "utf8");
    console.log(`[build-static-site] rendered ${pages.length} HTML pages (${LOCALES.join(", ")}) + sitemap.xml`);
  } finally {
    await vite.close();
  }
}

main().catch((error) => {
  console.error(`[build-static-site] fatal: ${error.message}`);
  process.exitCode = 1;
});
