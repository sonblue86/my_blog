/**
 * Theme: 'light' | 'dark' | 'system'. The initial value is applied by the inline script in Head.astro;
 * this module handles user changes, follows the OS while on 'system', and broadcasts `ns:theme-changed`.
 */
import { read, write } from '../lib/storage';

export type ThemePref = 'light' | 'dark' | 'system';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function getPref(): ThemePref {
  return read<ThemePref>('theme', 'system');
}

export function resolved(pref: ThemePref = getPref()): 'light' | 'dark' {
  return pref === 'system' ? (media.matches ? 'dark' : 'light') : pref;
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  const theme = resolved(pref);
  root.dataset.theme = theme;
  root.dataset.themePref = pref;
  document.dispatchEvent(new CustomEvent('ns:theme-changed', { detail: { theme, pref } }));
}

/**
 * Change theme. When `origin` (a click point) is given and the browser supports the View Transitions API,
 * the new theme spreads out as a circle from that point.
 */
export function setTheme(pref: ThemePref, origin?: { x: number; y: number }) {
  write('theme', pref);
  const before = document.documentElement.dataset.theme;
  const after = resolved(pref);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!origin || before === after || reduce || !('startViewTransition' in document)) {
    apply(pref);
    return;
  }

  const { x, y } = origin;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const root = document.documentElement;
  root.dataset.themeSwitching = '';
  const transition = document.startViewTransition(() => apply(pref));
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
  transition.finished.finally(() => delete root.dataset.themeSwitching);
}

export function toggleTheme(origin?: { x: number; y: number }) {
  setTheme(resolved() === 'dark' ? 'light' : 'dark', origin);
}

let wired = false;
export function initTheme() {
  if (wired) return;
  wired = true;
  media.addEventListener('change', () => {
    if (getPref() === 'system') apply('system');
  });
  // Keep tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === 'ns:theme') apply(getPref());
  });
}
