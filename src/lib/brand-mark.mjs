/**
 * The "Gì thế nhỉ" brand mark — single source of truth for its geometry.
 * A rounded gradient tile (indigo → coral) holding a white speech bubble with a bold question mark,
 * whose dot is a coral accent. Drawn on a 34×34 grid.
 *
 * Used by: src/components/layout/Logo.astro (header/footer), src/lib/og.ts (share cards),
 * scripts/gen-icons.mjs (favicon.svg/.ico, apple-touch-icon, PWA icons). Change it here, then `npm run icons`.
 *
 * Plain .mjs (not .ts) so the Node icon script can import it without a build step.
 */

export const BRAND = {
  from: '#6d5dfc',
  to: '#f0562e',
  /** Question-mark ink: a deeper indigo than `from` so it stays crisp on white at 16px (≈ 7:1). */
  ink: '#4a3bd6',
  dot: '#f0562e',
};

/** Speech bubble: body + tail (the tail gets a thin white stroke to round its tip). */
export const BUBBLE = {
  body: { x: 4.5, y: 4.5, width: 25, height: 20.5, rx: 7.5 },
  tail: 'M7.7 21L7.6 29.6L15.5 24.6Z',
};

/** Question mark: hook (stroked) + dot. */
export const QMARK = {
  hook: 'M13.31 10.45A3.75 3.75 0 1 1 19.41 13.97C17.9 14.74 17 15.45 17 16.75v.4',
  stroke: 3.3,
  dot: { cx: 17, cy: 21.7, r: 1.9 },
};

/**
 * Inner SVG markup (everything inside <svg viewBox="0 0 34 34">).
 * @param {object} [o]
 * @param {string} [o.id]       gradient id — must be unique per document when the mark appears twice
 * @param {boolean} [o.bleed]   square full-bleed tile (iOS / maskable icons add their own mask)
 * @param {number} [o.scale]    scale of the bubble around the tile centre (safe zones)
 * @param {number} [o.stroke]   question-mark stroke width (thicker for tiny raster sizes)
 * @param {number} [o.dotR]     question-mark dot radius
 * @param {boolean} [o.classes] add class names (logo-bubble, logo-q) for CSS animation
 * @returns {string}
 */
export function markInner({ id = 'g', bleed = false, scale = 1, stroke = QMARK.stroke, dotR = QMARK.dot.r, classes = false } = {}) {
  const b = BUBBLE.body;
  const t = scale === 1 ? '' : ` transform="translate(17 17) scale(${scale}) translate(-17 -17)"`;
  const cls = (name) => (classes ? ` class="${name}"` : '');
  return (
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${BRAND.from}"/><stop offset="1" stop-color="${BRAND.to}"/></linearGradient></defs>` +
    `<rect width="34" height="34"${bleed ? '' : ' rx="10"'} fill="url(#${id})"/>` +
    `<g${t}>` +
    `<g${cls('logo-bubble')} fill="#fff">` +
    `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.rx}"/>` +
    `<path d="${BUBBLE.tail}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>` +
    `</g>` +
    `<g${cls('logo-q')}>` +
    `<path d="${QMARK.hook}" fill="none" stroke="${BRAND.ink}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${QMARK.dot.cx}" cy="${QMARK.dot.cy}" r="${dotR}" fill="${BRAND.dot}"/>` +
    `</g>` +
    `</g>`
  );
}

/**
 * Standalone SVG document of the mark.
 * @param {Parameters<typeof markInner>[0] & { size?: number }} [o]  `size` sets width/height (omit for a scalable favicon)
 * @returns {string}
 */
export function markSvg({ size, ...o } = {}) {
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${dims} viewBox="0 0 34 34">${markInner(o)}</svg>`;
}
