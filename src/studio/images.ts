/**
 * Image handling for the writing studio: pick a safe file name, shrink big photos in the browser
 * (so the repo stays small and the build stays fast), and keep the bytes until the post is saved.
 */
import { slugify } from '../../scripts/lib/new-post-core.mjs';

export interface PendingImage {
  /** File name inside the post folder, e.g. "so-do-rag.webp". */
  name: string;
  bytes: Uint8Array;
  /** blob: URL for showing the image before it exists on GitHub. */
  url: string;
}

export const MAX_IMAGE_WIDTH = 1600;
/** Files below this size and width are stored as they are. */
export const KEEP_ORIGINAL_BELOW = 400 * 1024;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ALLOWED = /^image\/(?:jpeg|png|webp|avif|gif|svg\+xml)$/;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export function isSupportedImage(type: string): boolean {
  return ALLOWED.test(type);
}

/** "Ảnh chụp màn hình (2).PNG" + webp → "anh-chup-man-hinh-2.webp"; adds -2, -3… if the name is taken. */
export function imageFileName(original: string, ext: string, taken: Iterable<string>): string {
  const stem = slugify(original.replace(/\.[a-z0-9]+$/i, ''), 60) || 'anh';
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  let name = `${stem}.${ext}`;
  for (let i = 2; used.has(name); i++) name = `${stem}-${i}.${ext}`;
  return name;
}

/** Scale to fit `maxWidth`, keeping the aspect ratio. */
export function fitWidth(width: number, height: number, maxWidth = MAX_IMAGE_WIDTH): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

async function reencode(file: Blob): Promise<{ blob: Blob; type: string } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWidth(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    // Safari < 16 silently falls back to PNG: only accept a real WebP that is actually smaller.
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return null;
    return { blob, type: 'image/webp' };
  } catch {
    return null;
  }
}

/** Validate, shrink if worthwhile, and name an image the author dropped/pasted/picked. */
export async function prepareImage(file: File, taken: Iterable<string>): Promise<PendingImage> {
  if (!isSupportedImage(file.type)) throw new Error('Chỉ hỗ trợ ảnh JPG, PNG, WebP, AVIF, GIF hoặc SVG.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Ảnh lớn hơn 15 MB — bạn giảm dung lượng rồi thử lại nhé.');
  let blob: Blob = file;
  let type = file.type;
  // GIF (animation) and SVG (vector) must stay as they are.
  if (type !== 'image/gif' && type !== 'image/svg+xml') {
    const smaller = await reencode(file);
    if (smaller && (file.size > KEEP_ORIGINAL_BELOW || smaller.blob.size < file.size * 0.7)) ({ blob, type } = smaller);
  }
  const name = imageFileName(file.name || 'anh', EXT[type] ?? 'png', taken);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { name, bytes, url: URL.createObjectURL(new Blob([bytes], { type })) };
}

export function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? (ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream');
}
