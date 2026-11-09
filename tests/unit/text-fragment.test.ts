import { describe, it, expect } from 'vitest';
import {
  buildTextFragment,
  encodeFragmentTerm,
  withTextFragment,
  countOccurrences,
  truncateQuote,
  normalizeText,
} from '../../src/scripts/text-fragment';

describe('encodeFragmentTerm', () => {
  it('escapes dash, comma and ampersand (directive syntax characters)', () => {
    expect(encodeFragmentTerm('GPT-5, Claude & Gemini')).toBe('GPT%2D5%2C%20Claude%20%26%20Gemini');
  });
  it('normalises whitespace and to NFC before encoding', () => {
    const nfd = 'đường'.normalize('NFD');
    expect(encodeFragmentTerm(`  ${nfd}  đời `)).toBe(encodeURIComponent('đường đời'));
  });
});

describe('buildTextFragment', () => {
  it('encodes a short single-block selection verbatim', () => {
    expect(buildTextFragment('Đọc chậm, đọc sâu')).toBe(`#:~:text=${encodeURIComponent('Đọc chậm')}%2C${encodeURIComponent(' đọc sâu')}`);
  });

  it('uses textStart,textEnd (4 words each) for a long single block', () => {
    const s = 'một hai ba bốn năm sáu bảy tám chín mười mười-một';
    const hash = buildTextFragment(s);
    expect(hash).toBe(`#:~:text=${encodeFragmentTerm('một hai ba bốn')},${encodeFragmentTerm('tám chín mười mười-một')}`);
    expect(hash).toContain('m%C6%B0%E1%BB%9Di%2Dm%E1%BB%99t'); // "mười-một" with an escaped dash
  });

  it('takes start from the first block and end from the last block across paragraphs', () => {
    const s = 'Đời sống số thay đổi nhanh.\n\nĐoạn giữa.\n\nĐọc chậm, đọc sâu trở thành kỹ năng quý giá.';
    expect(buildTextFragment(s)).toBe(
      `#:~:text=${encodeFragmentTerm('Đời sống số thay')},${encodeFragmentTerm('kỹ năng quý giá.')}`,
    );
  });

  it('ignores empty / punctuation-only blocks', () => {
    expect(buildTextFragment('\n\n  \n')).toBe('');
    expect(buildTextFragment('—\n\nxin chào bạn')).toBe(`#:~:text=${encodeFragmentTerm('xin chào bạn')}`);
  });

  it('adds prefix/suffix context (last/first 3 words) when given', () => {
    const hash = buildTextFragment('token', { prefix: 'là đơn vị nhỏ nhất của', suffix: 'mà mô hình xử lý' });
    expect(hash).toBe(`#:~:text=${encodeFragmentTerm('nhỏ nhất của')}-,token,-${encodeFragmentTerm('mà mô hình')}`);
  });
});

describe('withTextFragment', () => {
  it('replaces an existing hash', () => {
    expect(withTextFragment('https://x.dev/bai-viet/a/#muc-1', '#:~:text=abc')).toBe('https://x.dev/bai-viet/a/#:~:text=abc');
  });
  it('returns the bare URL when the hash is empty', () => {
    expect(withTextFragment('https://x.dev/a/#b', '')).toBe('https://x.dev/a/');
  });
});

describe('countOccurrences', () => {
  it('is case-insensitive and whitespace-normalised', () => {
    expect(countOccurrences('Token là token.  TOKEN\nnữa', 'token')).toBe(3);
    expect(countOccurrences('abc', '')).toBe(0);
  });
});

describe('truncateQuote', () => {
  it('keeps short quotes', () => {
    expect(truncateQuote('  ngắn  thôi ')).toBe('ngắn thôi');
  });
  it('cuts at a word boundary and adds an ellipsis', () => {
    const q = truncateQuote('alpha beta gamma delta epsilon', 18);
    expect(q).toBe('alpha beta gamma…');
    expect(q.length).toBeLessThanOrEqual(18);
  });
});

describe('normalizeText', () => {
  it('collapses newlines and NBSP', () => {
    expect(normalizeText('a\n\n b c')).toBe('a b c');
  });
});
