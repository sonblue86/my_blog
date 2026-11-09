/** Sharing helpers: clipboard with fallback, share-intent URLs, native share sheet. */

export function toast(message: string, extra: Record<string, unknown> = {}) {
  document.dispatchEvent(new CustomEvent('ns:toast', { detail: { message, ...extra } }));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / insecure contexts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

const enc = encodeURIComponent;

export function shareLinks(title: string, url: string) {
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    x: `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
    email: `mailto:?subject=${enc(title)}&body=${enc(`${title}\n${url}`)}`,
  };
}

export function absoluteUrl(path: string): string {
  return new URL(path, location.origin).toString();
}

/** Native share sheet on touch devices; otherwise copy the link. */
export async function sharePost(title: string, url: string) {
  const full = absoluteUrl(url);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title, url: full });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  if (await copyText(full)) toast('Đã sao chép liên kết bài viết');
  else toast('Không sao chép được, bạn thử lại nhé', { tone: 'error' });
}
