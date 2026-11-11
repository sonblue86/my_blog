/**
 * Small HTTP + privacy helpers for the Worker. Only standard Web APIs (Request, Response, URL,
 * crypto.subtle), so they run unchanged in Workers, Node 24 and vitest.
 */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const MESSAGES = {
  badBody: 'Dữ liệu gửi lên chưa đúng, bạn tải lại trang rồi thử lại nhé.',
  tooLarge: 'Dữ liệu gửi lên quá lớn.',
  notJson: 'Cần gửi dữ liệu dạng JSON.',
  badOrigin: 'Yêu cầu bị từ chối vì không đến từ trang Gì thế nhỉ.',
  badSlug: 'Không tìm thấy bài viết này.',
  badKind: 'Cảm xúc này không có trong danh sách.',
  tooMany: 'Bạn thao tác hơi nhanh, nghỉ tay một chút rồi thử lại nhé.',
  badEmail: 'Email chưa đúng định dạng, bạn kiểm tra lại nhé.',
  captcha: 'Chưa xác minh được bạn là người thật. Bạn thử lại nhé.',
  notFound: 'Không có API này.',
  method: 'Phương thức này không được hỗ trợ.',
  disabled: 'Tính năng này chưa được bật trên máy chủ.',
  server: 'Máy chủ đang gặp trục trặc, bạn thử lại sau nhé.',
} as const;

const BASE_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

/** JSON response. Default: never cached (`no-store`). */
export function json(data: unknown, init: { status?: number; cache?: string; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { ...BASE_HEADERS, 'cache-control': init.cache ?? 'no-store', ...init.headers },
  });
}

export function errorResponse(status: number, message: string, headers?: Record<string, string>) {
  return json({ ok: false, error: message }, { status, headers });
}

/** Calendar day in Vietnam (UTC+7) as YYYY-MM-DD — the de-duplication window. */
export function dayKey(now: number = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Anonymous, daily-rotating reader key: SHA-256(day | ip | user-agent | salt), truncated to 96 bits.
 * Neither the IP nor the user agent is ever stored.
 *
 * The salt is REQUIRED and must be secret: this repository is public, so any built-in fallback would
 * let anyone brute-force the stored hashes back to IP addresses. Callers refuse to write without it.
 */
export async function visitorId(day: string, ip: string, ua: string, salt: string): Promise<string> {
  if (!salt) throw new Error('visitorId: missing salt');
  return (await sha256Hex(`${day}|${ip}|${ua}|${salt}`)).slice(0, 24);
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

/**
 * POSTs must come from a page of this site: the browser's `Origin` header must equal the Worker's own
 * origin or one of the comma-separated `extra` origins (env ALLOWED_ORIGINS). A missing Origin is rejected.
 */
export function isAllowedOrigin(origin: string | null, selfOrigin: string, extra = ''): boolean {
  if (!origin || origin === 'null') return false;
  if (origin === selfOrigin) return true;
  return extra
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .includes(origin);
}

export const MAX_BODY = 2048;

/** Parse a small JSON object body or throw an HttpError with a Vietnamese message. */
export async function readJsonBody(request: Request, maxBody = MAX_BODY): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) throw new HttpError(415, MESSAGES.notJson);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBody) throw new HttpError(413, MESSAGES.tooLarge);
  const text = await request.text();
  if (text.length > maxBody) throw new HttpError(413, MESSAGES.tooLarge);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, MESSAGES.badBody);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, MESSAGES.badBody);
  return data as Record<string, unknown>;
}

/** Tiny TTL cache (per Worker isolate) — used for the "does this post exist?" lookups. */
export class TtlCache<V> {
  private map = new Map<string, { value: V; until: number }>();
  constructor(private max = 500) {}
  get(key: string, now = Date.now()): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.until < now) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V, ttlMs: number, now = Date.now()) {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, until: now + ttlMs });
  }
}
