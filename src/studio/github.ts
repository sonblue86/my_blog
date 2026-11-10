/**
 * Minimal GitHub client for the writing studio (/viet-bai/). Runs in the browser and talks to
 * api.github.com directly with the owner's personal access token — the token never touches our Worker
 * except as a bearer for /api/ai, where it is only used to prove the caller can push to the repo.
 *
 * One save = ONE commit (Git Data API: blobs → tree → commit → ref), so a post and its images land
 * together and Cloudflare builds once.
 */

export interface RepoRef {
  /** "owner/name" */
  repo: string;
  branch: string;
}

export interface TreeEntry {
  path: string;
  sha: string;
  size?: number;
}

export interface CommitFile {
  path: string;
  /** Text is sent inline; bytes are uploaded as a blob first. */
  content: string | Uint8Array;
}

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const API = 'https://api.github.com';

/** UTF-8 safe base64 helpers (atob/btoa only handle Latin-1). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function explain(status: number, fallback: string): string {
  if (status === 401) return 'Token không hợp lệ hoặc đã hết hạn. Bạn tạo token mới rồi đăng nhập lại nhé.';
  if (status === 403) return 'Token không đủ quyền (cần Contents: Read and write cho repo này) hoặc đã vượt giới hạn gọi API.';
  if (status === 404) return 'Không tìm thấy repo hoặc token không được cấp quyền cho repo này.';
  if (status === 409 || status === 422) return 'GitHub từ chối thay đổi vì repo vừa có commit khác. Bạn thử lưu lại nhé.';
  return fallback || `GitHub trả về lỗi ${status}.`;
}

export class GitHub {
  constructor(
    private token: string,
    public readonly ref: RepoRef,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetcher(`${API}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${this.token}`,
          'x-github-api-version': '2022-11-28',
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new GitHubError(0, 'Không kết nối được tới GitHub. Bạn kiểm tra mạng rồi thử lại nhé.');
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = ((await res.json()) as { message?: string }).message ?? '';
      } catch {
        /* not JSON */
      }
      throw new GitHubError(res.status, explain(res.status, detail));
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private get base() {
    return `/repos/${this.ref.repo}`;
  }

  /** Who is this token, and may it push to the repo? */
  async verify(): Promise<{ canPush: boolean; isPrivate: boolean }> {
    const repo = await this.call<{ permissions?: { push?: boolean }; private?: boolean }>(this.base);
    return { canPush: repo.permissions?.push === true, isPrivate: repo.private === true };
  }

  /** Every blob under `prefix` on the branch (one request). */
  async listTree(prefix: string): Promise<{ commit: string; entries: TreeEntry[] }> {
    const head = await this.headCommit();
    const tree = await this.call<{ tree: { path: string; type: string; sha: string; size?: number }[]; truncated?: boolean }>(
      `${this.base}/git/trees/${head.tree}?recursive=1`,
    );
    const dir = prefix.replace(/\/+$/, '') + '/';
    return {
      commit: head.sha,
      entries: tree.tree.filter((e) => e.type === 'blob' && e.path.startsWith(dir)).map(({ path, sha, size }) => ({ path, sha, size })),
    };
  }

  async readBlob(sha: string): Promise<Uint8Array> {
    const blob = await this.call<{ content: string; encoding: string }>(`${this.base}/git/blobs/${sha}`);
    return blob.encoding === 'base64' ? base64ToBytes(blob.content) : new TextEncoder().encode(blob.content);
  }

  async readText(sha: string): Promise<string> {
    return new TextDecoder('utf-8').decode(await this.readBlob(sha));
  }

  private async headCommit(): Promise<{ sha: string; tree: string }> {
    const ref = await this.call<{ object: { sha: string } }>(`${this.base}/git/ref/heads/${encodeURIComponent(this.ref.branch)}`);
    const commit = await this.call<{ tree: { sha: string } }>(`${this.base}/git/commits/${ref.object.sha}`);
    return { sha: ref.object.sha, tree: commit.tree.sha };
  }

  /**
   * Write `files` and remove `deletes` in a single commit on top of the branch head.
   * Retries once if the branch moved between reading the head and updating the ref.
   */
  async commit(message: string, files: CommitFile[], deletes: string[] = []): Promise<{ sha: string }> {
    const uploaded: { path: string; sha?: string; content?: string }[] = [];
    for (const f of files) {
      if (typeof f.content === 'string') uploaded.push({ path: f.path, content: f.content });
      else {
        const blob = await this.call<{ sha: string }>(`${this.base}/git/blobs`, {
          method: 'POST',
          body: { content: bytesToBase64(f.content), encoding: 'base64' },
        });
        uploaded.push({ path: f.path, sha: blob.sha });
      }
    }

    for (let attempt = 0; ; attempt++) {
      const head = await this.headCommit();
      const tree = await this.call<{ sha: string }>(`${this.base}/git/trees`, {
        method: 'POST',
        body: {
          base_tree: head.tree,
          tree: [
            ...uploaded.map((f) => ({ path: f.path, mode: '100644', type: 'blob', ...(f.sha ? { sha: f.sha } : { content: f.content }) })),
            ...deletes.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
          ],
        },
      });
      const commit = await this.call<{ sha: string }>(`${this.base}/git/commits`, {
        method: 'POST',
        body: { message, tree: tree.sha, parents: [head.sha] },
      });
      try {
        await this.call(`${this.base}/git/refs/heads/${encodeURIComponent(this.ref.branch)}`, {
          method: 'PATCH',
          body: { sha: commit.sha, force: false },
        });
        return { sha: commit.sha };
      } catch (err) {
        const moved = err instanceof GitHubError && (err.status === 422 || err.status === 409);
        if (!moved || attempt >= 1) throw err;
      }
    }
  }
}
