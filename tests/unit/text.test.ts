import { describe, it, expect } from 'vitest';
import { slugify, readingTime, fold, countWords } from '../../src/lib/text';

describe('slugify', () => {
  it('removes Vietnamese diacritics and đ', () => {
    expect(slugify('Trí tuệ nhân tạo đang thay đổi Đà Nẵng?')).toBe('tri-tue-nhan-tao-dang-thay-doi-da-nang');
  });
  it('collapses symbols and trims dashes', () => {
    expect(slugify('  GPT-5 & Claude: so sánh!  ')).toBe('gpt-5-claude-so-sanh');
  });
});

describe('fold', () => {
  it('folds đ which Unicode NFD does not decompose', () => {
    expect(fold('Đường đời')).toBe('duong doi');
  });
});

describe('readingTime', () => {
  it('ignores code blocks and frontmatter when counting words', () => {
    const md = '---\ntitle: x\n---\nmột hai ba bốn\n```js\nconst a = 1; const b = 2;\n```\n';
    expect(countWords(md)).toBe(4);
  });
  it('is at least one minute', () => {
    expect(readingTime('xin chào').minutes).toBe(1);
  });
  it('scales with length (~260 words/min)', () => {
    const md = Array.from({ length: 1300 }, () => 'chữ').join(' ');
    expect(readingTime(md).minutes).toBe(5);
  });
});
