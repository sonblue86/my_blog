// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolvePrefs,
  compactPrefs,
  stepScale,
  scaleIndex,
  applyPrefs,
  savePrefs,
  loadPrefs,
  isDefault,
  DEFAULTS,
  SCALES,
  percent,
} from '../../src/scripts/reader-settings';

describe('resolvePrefs', () => {
  it('falls back to defaults for junk', () => {
    expect(resolvePrefs(null)).toEqual(DEFAULTS);
    expect(resolvePrefs('x')).toEqual(DEFAULTS);
    expect(resolvePrefs({ font: 'comic', scale: 'big', leading: NaN })).toEqual(DEFAULTS);
  });
  it('snaps numbers to the nearest allowed step', () => {
    expect(resolvePrefs({ font: 'serif', scale: 1.1, leading: 1.9, width: 100 })).toEqual({
      font: 'serif',
      scale: 1.08,
      leading: 1.95,
      width: 78,
    });
  });
});

describe('compactPrefs / isDefault', () => {
  it('keeps only non-default keys (exact storage shape)', () => {
    expect(compactPrefs(DEFAULTS)).toEqual({});
    expect(compactPrefs({ ...DEFAULTS, scale: 1.16, width: 60 })).toEqual({ scale: 1.16, width: 60 });
    expect(isDefault(DEFAULTS)).toBe(true);
    expect(isDefault({ ...DEFAULTS, font: 'display' })).toBe(false);
  });
});

describe('stepScale', () => {
  it('has 7 steps from 0.88 to 1.32', () => {
    expect(SCALES.length).toBe(7);
    expect(SCALES[0]).toBe(0.88);
    expect(SCALES[6]).toBe(1.32);
  });
  it('moves one step and clamps at both ends', () => {
    expect(stepScale(1, 1)).toBe(1.08);
    expect(stepScale(1, -1)).toBe(0.94);
    expect(stepScale(1.32, 1)).toBe(1.32);
    expect(stepScale(0.88, -1)).toBe(0.88);
    expect(scaleIndex(1)).toBe(2);
    expect(percent(1.08)).toBe('108%');
  });
});

describe('applyPrefs', () => {
  it('sets and clears the html attributes / CSS variables', () => {
    const root = document.createElement('html');
    applyPrefs({ font: 'serif', scale: 1.24, leading: 1.6, width: 78 }, root);
    expect(root.dataset.readingFont).toBe('serif');
    expect(root.style.getPropertyValue('--reader-scale')).toBe('1.24');
    expect(root.style.getPropertyValue('--reader-leading')).toBe('1.6');
    expect(root.style.getPropertyValue('--reader-width')).toBe('78ch');
    applyPrefs(DEFAULTS, root);
    expect(root.dataset.readingFont).toBeUndefined();
    expect(root.style.getPropertyValue('--reader-scale')).toBe('');
    expect(root.style.getPropertyValue('--reader-width')).toBe('');
  });
});

describe('persistence', () => {
  beforeEach(() => localStorage.clear());
  it('writes the compact shape under ns:reader and removes it for defaults', () => {
    savePrefs({ ...DEFAULTS, font: 'display', leading: 1.95 });
    expect(JSON.parse(localStorage.getItem('ns:reader')!)).toEqual({ font: 'display', leading: 1.95 });
    expect(loadPrefs()).toEqual({ ...DEFAULTS, font: 'display', leading: 1.95 });
    savePrefs(DEFAULTS);
    expect(localStorage.getItem('ns:reader')).toBeNull();
  });
});
