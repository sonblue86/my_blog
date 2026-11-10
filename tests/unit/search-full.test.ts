import { describe, it, expect } from 'vitest';
import { queryVariants, isRelevant } from '../../src/scripts/search-full';
import { terms } from '../../src/scripts/search-core';

describe('queryVariants', () => {
  it('adds an "đ" variant for accent-less words starting with d (Pagefind does not fold đ)', () => {
    expect(queryVariants('duong')).toEqual(['duong', 'đuong']);
    expect(queryVariants('dien thoai')).toEqual(['dien thoai', 'đien thoai']);
  });
  it('leaves queries typed with accents alone', () => {
    expect(queryVariants('đường')).toEqual(['đường']);
    expect(queryVariants('dùng git')).toEqual(['dùng git']);
  });
  it('no variant when no word starts with d', () => {
    expect(queryVariants('git rebase')).toEqual(['git rebase']);
  });
});

describe('isRelevant', () => {
  const text = 'Trí nhớ ngắn hạn của mô hình: con đường từ token tới câu trả lời.';
  it('matches accent-insensitively at word starts', () => {
    expect(isRelevant(text, terms('duong'))).toBe(true);
    expect(isRelevant(text, terms('tri nho'))).toBe(true);
    expect(isRelevant(text, terms('cau tra loi'))).toBe(true);
  });
  it('rejects loose fallback matches where a word is missing', () => {
    expect(isRelevant(text, terms('tri tue'))).toBe(false);
    expect(isRelevant(text, terms('xyzq'))).toBe(false);
  });
  it('does not match inside words', () => {
    expect(isRelevant(text, terms('uong'))).toBe(false);
  });
});
