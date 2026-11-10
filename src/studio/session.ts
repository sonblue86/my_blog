/**
 * Browser storage for the writing studio: the GitHub token and unsaved work.
 *
 * Token: kept in sessionStorage (gone when the tab closes) unless the author ticks "ghi nhớ", then in
 * localStorage. It is only ever sent to api.github.com and, as a bearer, to this site's own /api/ai.
 * Unsaved work: text only (title, settings, body) in localStorage, so a closed tab or a crash never
 * loses writing. Images that were not yet saved to GitHub cannot be kept and must be added again.
 */
import type { PostMeta } from './post-file';

const TOKEN_KEY = 'ns-studio:token';
const DRAFT_PREFIX = 'ns-studio:draft:';

const store = (persistent: boolean): Storage | null => {
  try {
    return persistent ? localStorage : sessionStorage;
  } catch {
    return null;
  }
};

export function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string, remember: boolean) {
  clearToken();
  try {
    store(remember)?.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode: stay signed in for this page load only */
  }
}

export function clearToken() {
  for (const s of [store(false), store(true)]) {
    try {
      s?.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
}

export interface LocalDraft {
  /** Slug of the post being edited, or the chosen slug of a new post. */
  slug: string;
  isNew: boolean;
  meta: PostMeta;
  body: string;
  /** Blob sha of the file this draft was based on (undefined for a new post). */
  baseSha?: string;
  savedAt: number;
}

const draftKey = (id: string) => `${DRAFT_PREFIX}${id}`;

/** `id` is the post slug, or "new" for a post that does not exist on GitHub yet. */
export function saveLocalDraft(id: string, draft: LocalDraft) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    /* quota or private mode: nothing we can do */
  }
}

export function loadLocalDraft(id: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const d = JSON.parse(raw) as LocalDraft;
    return d && typeof d.body === 'string' && d.meta && typeof d.meta.title === 'string' ? d : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}

export function hasLocalDraft(id: string): boolean {
  return loadLocalDraft(id) !== null;
}
