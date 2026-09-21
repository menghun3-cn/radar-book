import { sleep } from "./utils.mjs";

const GITHUB_API = "https://api.github.com";
export const SEARCH_MAX_PAGE = 10;

export class GitHubClient {
  constructor({ token, maxRetries = 3, log = console } = {}) {
    this.token = token;
    this.maxRetries = maxRetries;
    this.log = log;
  }

  headers(accept = "application/vnd.github+json") {
    const headers = {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-tutorial-radar",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  async request(path, { method = "GET", body, accept } = {}) {
    const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: this.headers(accept),
        body: body ? JSON.stringify(body) : undefined,
      });
      const remaining = response.headers.get("x-ratelimit-remaining");
      const resetAt = Number(response.headers.get("x-ratelimit-reset") ?? 0);

      if (response.status === 429 || response.status >= 500 || (response.status === 403 && remaining === "0")) {
        const waitBefore = Math.max(
          1000 * 2 ** attempt,
          resetAt ? Math.max(0, resetAt * 1000 - Date.now()) + 1000 : 0,
        );
        this.log.warn?.(`GitHub API ${response.status}; retrying in ${Math.round(waitBefore / 1000)}s`);
        await sleep(Math.min(waitBefore, 60_000));
        continue;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`${method} ${url} -> ${response.status}: ${text.slice(0, 300)}`);
      }
      return response.json();
    }
    throw new Error(`GitHub API request failed after ${this.maxRetries + 1} attempts: ${url}`);
  }

  splitFullName(fullName) {
    const [owner, name] = String(fullName).split("/");
    if (!owner || !name) throw new Error(`Invalid repository name: ${fullName}`);
    return { owner, name };
  }

  async getRepo(fullName) {
    const { owner, name } = this.splitFullName(fullName);
    return this.request(`/repos/${owner}/${name}`);
  }

  async getBranchHead(fullName, branch) {
    const { owner, name } = this.splitFullName(fullName);
    try {
      const data = await this.request(`/repos/${owner}/${name}/branches/${encodeURIComponent(branch)}`);
      return data.commit.sha;
    } catch {
      return null;
    }
  }

  async getTree(fullName, sha) {
    const { owner, name } = this.splitFullName(fullName);
    return this.request(`/repos/${owner}/${name}/git/trees/${sha}?recursive=1`);
  }

  async getContents(fullName, filePath, ref) {
    const { owner, name } = this.splitFullName(fullName);
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const data = await this.request(`/repos/${owner}/${name}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`);
    if (Array.isArray(data)) return null;
    return data;
  }

  async getFileText(fullName, filePath, ref) {
    const content = await this.getContents(fullName, filePath, ref);
    if (!content) return null;
    if (content.content) {
      const cleaned = content.content.replace(/\s/g, "");
      return Buffer.from(cleaned, "base64").toString("utf8");
    }
    if (content.download_url) {
      const response = await fetch(content.download_url, { headers: this.headers() });
      if (!response.ok) return null;
      const text = await response.text();
      return text.slice(0, 1_200_000);
    }
    return null;
  }

  async getRef(fullName, ref) {
    return this.request(`/repos/${fullName}/git/refs/${encodeURIComponent(ref)}`);
  }

  async updateRef(fullName, ref, sha) {
    return this.request(`/repos/${fullName}/git/refs/${encodeURIComponent(ref)}`, {
      method: "PATCH",
      body: { sha, force: false },
    });
  }

  async getCommit(fullName, sha) {
    return this.request(`/repos/${fullName}/git/commits/${sha}`);
  }

  async createBlob(fullName, content) {
    return this.request(`/repos/${fullName}/git/blobs`, {
      method: "POST",
      body: { content, encoding: "utf-8" },
    });
  }

  async createTree(fullName, baseTree, entries) {
    return this.request(`/repos/${fullName}/git/trees`, {
      method: "POST",
      body: { base_tree: baseTree, tree: entries },
    });
  }

  async createCommit(fullName, message, treeSha, parents) {
    return this.request(`/repos/${fullName}/git/commits`, {
      method: "POST",
      body: { message, tree: treeSha, parents },
    });
  }

  async getIssue(fullName, issueNumber) {
    return this.request(`/repos/${fullName}/issues/${Number(issueNumber)}`);
  }

  async createIssueComment(fullName, issueNumber, body) {
    return this.request(`/repos/${fullName}/issues/${Number(issueNumber)}/comments`, {
      method: "POST",
      body: { body },
    });
  }

  async listIssueComments(fullName, issueNumber) {
    return this.request(`/repos/${fullName}/issues/${Number(issueNumber)}/comments`);
  }

  async updateIssue(fullName, issueNumber, state) {
    return this.request(`/repos/${fullName}/issues/${Number(issueNumber)}`, {
      method: "PATCH",
      body: { state },
    });
  }

  async addIssueLabels(fullName, issueNumber, labels) {
    return this.request(`/repos/${fullName}/issues/${Number(issueNumber)}/labels`, {
      method: "POST",
      body: { labels },
    });
  }

  async searchRepositories(query, page = 1, perPage = 100) {
    return this.request(
      `/search/repositories?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`,
    );
  }

  async searchCode(query, page = 1, perPage = 100) {
    return this.request(
      `/search/code?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`,
    );
  }
}

export function paginationInfo(totalCount, page, perPage = 100) {
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const lastPage = Math.min(SEARCH_MAX_PAGE, totalPages);
  const nextPage = page >= lastPage ? 1 : page + 1;
  return { totalPages, lastPage, nextPage };
}
