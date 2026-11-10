/** Browser side of POST /api/ai (worker/ai.ts). The GitHub token proves the caller owns the blog. */
import type { AiMeta, AiRequest } from '../../worker/shared';

export type { AiMeta, AiRequest };

async function call(body: AiRequest, token: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error('Không kết nối được tới trợ lý AI. Bạn kiểm tra mạng rồi thử lại nhé.');
  }
  if (!res.ok) {
    let message = `Trợ lý AI gặp lỗi (${res.status}).`;
    try {
      message = ((await res.json()) as { error?: string }).error || message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return res;
}

/** Streams the answer; `onText` receives the full text so far. Resolves with the final text. */
export async function aiStream(body: AiRequest, token: string, onText: (text: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await call(body, token, signal);
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  text += decoder.decode();
  onText(text);
  return text.trim();
}

export async function aiMeta(title: string, body: string, token: string, signal?: AbortSignal): Promise<AiMeta> {
  const res = await call({ action: 'meta', title, body }, token, signal);
  return ((await res.json()) as { meta: AiMeta }).meta;
}

/** Is the assistant configured on the server? (No secret is revealed — only a boolean.) */
export async function aiAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    return res.ok && ((await res.json()) as { ai?: boolean }).ai === true;
  } catch {
    return false;
  }
}
