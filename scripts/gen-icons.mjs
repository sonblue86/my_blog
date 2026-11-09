#!/usr/bin/env node
/**
 * Generate favicons + PWA icons from the brand mark (same artwork as src/components/layout/Logo.astro).
 *
 *   npm run icons
 *
 * Writes to public/: favicon.svg, favicon.ico (16/32/48 PNGs in an ICO container),
 * apple-touch-icon.png (180, full-bleed), icon-192.png, icon-512.png (rounded, transparent corners),
 * icon-maskable-512.png (full-bleed, mark inside the 80% safe zone).
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = fileURLToPath(new URL('../public/', import.meta.url));

/** Brand: gradient #6d5dfc → #f0562e, white "pulse" line. viewBox 0 0 34 34. */
const PULSE = 'M6 18.5h5.2l2.6-6.5 4.4 11 3.1-8 1.9 3.5H28';
// Visual centre of the pulse path (x 6..28, y 12..23).
const CX = 17;
const CY = 17.5;

/**
 * @param {object} o
 * @param {number} o.size     output px (width/height attributes)
 * @param {boolean} [o.bleed] full-bleed square (no rounded corners / transparency)
 * @param {number} [o.scale]  scale of the pulse line around its centre
 * @param {number} [o.stroke] stroke width in viewBox units
 */
function markSvg({ size, bleed = false, scale = 1, stroke = 2.6 }) {
  const t = scale === 1 ? '' : ` transform="translate(${CX} ${CY}) scale(${scale}) translate(${-CX} ${-CY})"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 34 34">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6d5dfc"/>
      <stop offset="1" stop-color="#f0562e"/>
    </linearGradient>
  </defs>
  <rect width="34" height="34"${bleed ? '' : ' rx="10"'} fill="url(#g)"/>
  <path${t} d="${PULSE}" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

const png = (svg, opaque = false) => {
  const img = sharp(Buffer.from(svg));
  return (opaque ? img.removeAlpha() : img).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
};

/** Minimal ICO container: ICONDIR + one ICONDIRENTRY per image, PNG payloads (supported since Windows Vista). */
export function icoFromPngs(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); // width (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1); // height
    dir.writeUInt8(0, o + 2); // palette colours
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = {};

  // Small sizes get a slightly thicker line so the pulse survives at 16px.
  files['favicon.svg'] = Buffer.from(markSvg({ size: 34 }).replace(' width="34" height="34"', ''));
  const icoImages = [];
  for (const size of [16, 32, 48]) {
    icoImages.push({ size, data: await png(markSvg({ size, stroke: size <= 16 ? 3.4 : size <= 32 ? 3 : 2.8 })) });
  }
  files['favicon.ico'] = icoFromPngs(icoImages);

  // iOS masks its own rounded corners, so the touch icon is full-bleed and opaque.
  files['apple-touch-icon.png'] = await png(markSvg({ size: 180, bleed: true, scale: 0.9, stroke: 2.7 }), true);
  files['icon-192.png'] = await png(markSvg({ size: 192 }));
  files['icon-512.png'] = await png(markSvg({ size: 512 }));
  // Maskable: launchers may crop to a circle of 80% diameter → keep the mark well inside it.
  files['icon-maskable-512.png'] = await png(markSvg({ size: 512, bleed: true, scale: 0.78, stroke: 2.9 }), true);

  for (const [name, data] of Object.entries(files)) {
    await writeFile(OUT + name, data);
    console.log(`✓ public/${name}  ${(data.length / 1024).toFixed(1)} kB`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
