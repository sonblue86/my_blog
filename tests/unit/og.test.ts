import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  OG_HEIGHT,
  OG_WIDTH,
  TITLE_SIZES,
  charWidthEm,
  estimateTextWidth,
  fitTitle,
  hexToRgba,
  normalizeText,
  renderOgImage,
  wrapLines,
} from '../../src/lib/og';
import { coverSvg } from '../../src/lib/cover';

describe('normalizeText', () => {
  it('composes Vietnamese letters to NFC and collapses whitespace', () => {
    const decomposed = 'Nh̆̃ng'.normalize('NFD'); // arbitrary combining sequence
    expect(normalizeText(decomposed)).toBe(decomposed.normalize('NFC'));
    expect(normalizeText('ữ'.normalize('NFD'))).toBe('ữ');
    expect(normalizeText('  Đời \n sống\t số  ')).toBe('Đời sống số');
  });
  it('turns paired straight quotes into typographic quotes', () => {
    expect(normalizeText('chuyện AI "bịa" và "ting"')).toBe('chuyện AI “bịa” và “ting”');
    expect(normalizeText('5" màn hình')).toBe('5" màn hình');
  });
});

describe('hexToRgba', () => {
  it('converts 6- and 3-digit hex', () => {
    expect(hexToRgba('#a78bfa', 0.2)).toBe('rgba(167, 139, 250, 0.2)');
    expect(hexToRgba('fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });
  it('rejects invalid input', () => {
    expect(() => hexToRgba('#12', 1)).toThrow();
    expect(() => hexToRgba('var(--cat-ai)', 1)).toThrow();
  });
});

describe('charWidthEm / estimateTextWidth', () => {
  it('ignores diacritics (accented letters are as wide as their base letter)', () => {
    expect(charWidthEm('ữ')).toBe(charWidthEm('u'));
    expect(charWidthEm('Đ')).toBe(charWidthEm('D'));
    expect(charWidthEm('ẳ')).toBe(charWidthEm('a'));
  });
  it('orders narrow < regular < wide glyphs', () => {
    expect(charWidthEm('i')).toBeLessThan(charWidthEm('a'));
    expect(charWidthEm('a')).toBeLessThan(charWidthEm('m'));
    expect(charWidthEm('A')).toBeLessThan(charWidthEm('W'));
  });
  it('scales with font size and letter spacing', () => {
    expect(estimateTextWidth('abc', 20)).toBeCloseTo(estimateTextWidth('abc', 10) * 2);
    expect(estimateTextWidth('abc', 10, -1)).toBeCloseTo(estimateTextWidth('abc', 10) - 3);
  });
});

describe('wrapLines', () => {
  it('keeps short text on one line', () => {
    expect(wrapLines('RAG là gì?', 60, 800)).toEqual(['RAG là gì?']);
  });
  it('breaks at word boundaries within the width', () => {
    const lines = wrapLines('một hai ba bốn năm sáu bảy tám chín mười', 60, 400);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('một hai ba bốn năm sáu bảy tám chín mười');
    for (const line of lines) expect(estimateTextWidth(line, 60)).toBeLessThanOrEqual(400);
  });
  it('puts a single over-long word on its own line instead of looping', () => {
    expect(wrapLines('Siêuuuuuuuuuuuuuuuuuuuudài ngắn', 60, 200)).toEqual(['Siêuuuuuuuuuuuuuuuuuuuudài', 'ngắn']);
  });
});

describe('fitTitle', () => {
  const opts = { maxWidth: 780, maxLines: 3 };

  it('uses the largest size for short titles', () => {
    const fit = fitTitle('RAG là gì?', opts);
    expect(fit.fontSize).toBe(Math.max(...TITLE_SIZES));
    expect(fit.truncated).toBe(false);
    expect(fit.lines).toEqual(['RAG là gì?']);
  });

  it('shrinks the font as titles get longer, never above 3 lines', () => {
    // Real titles from the blog, ~50 → ~80 characters: all must fit untruncated.
    const short = fitTitle('Git cho người mới: 12 lệnh dùng mỗi ngày', opts);
    const medium = fitTitle('Dựng blog miễn phí với Astro, GitHub và Cloudflare', opts);
    const long = fitTitle('Deep work giữa thời đại thông báo: cách làm việc sâu khi mọi thứ đều "ting"', opts);
    for (const fit of [short, medium, long]) {
      expect(fit.lines.length).toBeLessThanOrEqual(3);
      expect(fit.truncated).toBe(false);
    }
    expect(medium.fontSize).toBeLessThanOrEqual(short.fontSize);
    expect(long.fontSize).toBeLessThan(short.fontSize);
  });

  it('truncates very long titles at a word boundary with an ellipsis', () => {
    const title = Array.from({ length: 40 }, (_, i) => `từ${i}`).join(' ');
    const fit = fitTitle(title, opts);
    expect(fit.truncated).toBe(true);
    expect(fit.fontSize).toBe(Math.min(...TITLE_SIZES));
    expect(fit.lines).toHaveLength(3);
    expect(fit.text.endsWith('…')).toBe(true);
    // Only whole words survive (no "từ1…" from "từ12").
    const kept = fit.text.slice(0, -1).split(' ');
    for (const word of kept) expect(title.split(' ')).toContain(word);
    for (const line of fit.lines) expect(estimateTextWidth(line, fit.fontSize, fit.letterSpacing)).toBeLessThanOrEqual(780);
  });

  it('does not leave dangling punctuation before the ellipsis', () => {
    const title = `${'chữ '.repeat(60)}cuối`;
    const fit = fitTitle(title.replace(/ /g, ', '), { maxWidth: 400, maxLines: 2 });
    expect(fit.text).not.toMatch(/[,\s]…$/);
  });

  it('hard-cuts a single giant word', () => {
    const fit = fitTitle('A'.repeat(200), { maxWidth: 300, maxLines: 1 });
    expect(fit.truncated).toBe(true);
    expect(fit.text.endsWith('…')).toBe(true);
    expect(estimateTextWidth(fit.text, fit.fontSize, fit.letterSpacing)).toBeLessThanOrEqual(300);
  });

  it('normalises the title (NFC, single spaces)', () => {
    expect(fitTitle('  Đời   sống\nsố '.normalize('NFD'), opts).text).toBe('Đời sống số');
  });
});

describe('renderOgImage', () => {
  it('renders a 1200×630 JPEG with Vietnamese text', async () => {
    const png = await renderOgImage({
      title: 'Những ữ ự ỡ Đ ẳ — thử dấu tiếng Việt',
      chips: [{ label: 'Đời sống', color: '#34d399' }],
      meta: ['5 phút đọc', '9 tháng 11, 2026'],
      host: 'example.com',
      siteName: 'Nhịp Số',
      art: { svg: coverSvg({ seed: 'og-test', category: 'doi-song' }) },
    });
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(OG_WIDTH);
    expect(meta.height).toBe(OG_HEIGHT);
  }, 20_000);
});
