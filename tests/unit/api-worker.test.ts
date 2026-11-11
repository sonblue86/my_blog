import { describe, it, expect } from 'vitest';
import { isValidSlug, isValidEmail, normalizeEmail, isReactionKind, emptyStats, REACTION_KINDS } from '../../worker/shared';
import { dayKey, visitorId, isAllowedOrigin, readJsonBody, HttpError, TtlCache, clientIp, MAX_BODY } from '../../worker/lib';

describe('isValidSlug', () => {
  it('accepts post ids', () => {
    for (const s of ['xin-chao', 'ai', 'gpt-5-la-gi', '2026/xin-chao', 'a_b']) expect(isValidSlug(s)).toBe(true);
  });
  it('rejects anything that could escape /bai-viet/<slug>/', () => {
    for (const s of ['', 'Xin-Chao', '../etc', 'a//b', '-a', 'a-', 'a b', 'tiếng-việt', 'a?b', 'x'.repeat(121), null, 42]) {
      expect(isValidSlug(s)).toBe(false);
    }
  });
});

describe('isValidEmail / normalizeEmail', () => {
  it('accepts normal addresses', () => {
    for (const e of ['ban@email.com', 'first.last+tag@sub.example.vn', 'a@b.co']) expect(isValidEmail(e)).toBe(true);
  });
  it('rejects typos and junk', () => {
    for (const e of ['', 'a@b', 'a b@c.com', 'a@b..com', 'a@@b.com', '@b.com', 'a@b.c', 'a@-b.com', `${'x'.repeat(65)}@b.com`, 7]) {
      expect(isValidEmail(e)).toBe(false);
    }
  });
  it('normalizes case and whitespace', () => {
    expect(normalizeEmail('  Ban@Email.COM ')).toBe('ban@email.com');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('reactions contract', () => {
  it('knows exactly the five kinds', () => {
    expect(REACTION_KINDS).toEqual(['like', 'love', 'fire', 'mindblown', 'clap']);
    expect(isReactionKind('love')).toBe(true);
    expect(isReactionKind('angry')).toBe(false);
    expect(emptyStats('a')).toEqual({ slug: 'a', views: 0, reactions: { like: 0, love: 0, fire: 0, mindblown: 0, clap: 0 } });
  });
});

describe('dayKey', () => {
  it('uses the Vietnam calendar day (UTC+7)', () => {
    expect(dayKey(Date.UTC(2026, 10, 9, 16, 59))).toBe('2026-11-09'); // 23:59 in Hà Nội
    expect(dayKey(Date.UTC(2026, 10, 9, 17, 0))).toBe('2026-11-10'); // 00:00 next day in Hà Nội
  });
});

describe('visitorId', () => {
  it('is deterministic per day and contains no raw IP', async () => {
    const a = await visitorId('2026-11-09', '203.0.113.7', 'UA', 'salt');
    expect(a).toBe(await visitorId('2026-11-09', '203.0.113.7', 'UA', 'salt'));
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(a).not.toContain('203');
  });
  it('refuses to hash without a secret salt (no public fallback)', async () => {
    await expect(visitorId('2026-11-09', '1.1.1.1', 'UA', '')).rejects.toThrow(/salt/);
  });
  it('rotates daily and depends on ip, ua and salt', async () => {
    const base = await visitorId('2026-11-09', '1.1.1.1', 'UA', 's');
    expect(await visitorId('2026-11-10', '1.1.1.1', 'UA', 's')).not.toBe(base);
    expect(await visitorId('2026-11-09', '1.1.1.2', 'UA', 's')).not.toBe(base);
    expect(await visitorId('2026-11-09', '1.1.1.1', 'UA2', 's')).not.toBe(base);
    expect(await visitorId('2026-11-09', '1.1.1.1', 'UA', 's2')).not.toBe(base);
  });
});

describe('clientIp', () => {
  it('prefers CF-Connecting-IP', () => {
    const r = new Request('https://x.dev/', { headers: { 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } });
    expect(clientIp(r)).toBe('9.9.9.9');
    expect(clientIp(new Request('https://x.dev/', { headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } }))).toBe('1.1.1.1');
  });
});

describe('isAllowedOrigin', () => {
  const self = 'https://githenhi.com';
  it('allows the same origin and configured extras only', () => {
    expect(isAllowedOrigin(self, self)).toBe(true);
    expect(isAllowedOrigin('http://localhost:4321', self, 'http://localhost:4321/, https://preview.githenhi.com')).toBe(true);
    expect(isAllowedOrigin('https://preview.githenhi.com', self, 'http://localhost:4321/, https://preview.githenhi.com')).toBe(true);
  });
  it('rejects missing, opaque and foreign origins', () => {
    expect(isAllowedOrigin(null, self)).toBe(false);
    expect(isAllowedOrigin('null', self)).toBe(false);
    expect(isAllowedOrigin('https://evil.example', self, '')).toBe(false);
    expect(isAllowedOrigin('https://githenhi.com.evil.example', self)).toBe(false);
  });
});

describe('readJsonBody', () => {
  const req = (body: string, type = 'application/json') =>
    new Request('https://x.dev/api/view', { method: 'POST', headers: { 'content-type': type }, body });

  it('parses a JSON object', async () => {
    await expect(readJsonBody(req('{"slug":"a"}'))).resolves.toEqual({ slug: 'a' });
  });
  it('maps bad input to HTTP errors', async () => {
    const status = (p: Promise<unknown>) => p.then(() => 200, (e: HttpError) => e.status);
    expect(await status(readJsonBody(req('{"slug":"a"}', 'text/plain')))).toBe(415);
    expect(await status(readJsonBody(req('{oops')))).toBe(400);
    expect(await status(readJsonBody(req('[1,2]')))).toBe(400);
    expect(await status(readJsonBody(req('null')))).toBe(400);
    expect(await status(readJsonBody(req(JSON.stringify({ s: 'x'.repeat(MAX_BODY) }))))).toBe(413);
  });
});

describe('TtlCache', () => {
  it('expires entries and evicts the oldest when full', () => {
    const c = new TtlCache<boolean>(2);
    c.set('a', true, 1000, 0);
    expect(c.get('a', 999)).toBe(true);
    expect(c.get('a', 1001)).toBeUndefined();
    c.set('a', true, 1000, 0);
    c.set('b', true, 1000, 0);
    c.set('c', true, 1000, 0);
    expect(c.get('a', 1)).toBeUndefined();
    expect(c.get('c', 1)).toBe(true);
  });
});
