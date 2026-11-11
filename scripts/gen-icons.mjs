#!/usr/bin/env node
/**
 * Generate favicons + PWA icons from the brand mark (geometry in src/lib/brand-mark.mjs, the same artwork as
 * src/components/layout/Logo.astro and the OG cards).
 *
 *   npm run icons
 *
 * Writes to public/: favicon.svg, favicon.ico (16/32/48 PNGs in an ICO container),
 * apple-touch-icon.png (180, full-bleed), icon-192.png, icon-512.png (rounded, transparent corners),
 * icon-maskable-512.png (full-bleed, mark inside the 80% safe zone).
 *
 * The mark carries its own gradient tile, so the favicon reads the same on light and dark browser tabs.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { markSvg } from '../src/lib/brand-mark.mjs';

const OUT = fileURLToPath(new URL('../public/', import.meta.url));

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

  files['favicon.svg'] = Buffer.from(`${markSvg()}\n`);
  // Tiny rasters get a slightly heavier question mark so it survives at 16px.
  const icoImages = [];
  for (const size of [16, 32, 48]) {
    const heavy = size <= 16 ? { stroke: 3.9, dotR: 2.15 } : size <= 32 ? { stroke: 3.5, dotR: 2 } : {};
    icoImages.push({ size, data: await png(markSvg({ size, ...heavy })) });
  }
  files['favicon.ico'] = icoFromPngs(icoImages);

  // iOS masks its own rounded corners, so the touch icon is full-bleed and opaque.
  files['apple-touch-icon.png'] = await png(markSvg({ size: 180, bleed: true, scale: 0.9 }), true);
  files['icon-192.png'] = await png(markSvg({ size: 192 }));
  files['icon-512.png'] = await png(markSvg({ size: 512 }));
  // Maskable: launchers may crop to a circle of 80% diameter → keep the bubble well inside it.
  files['icon-maskable-512.png'] = await png(markSvg({ size: 512, bleed: true, scale: 0.74 }), true);

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
