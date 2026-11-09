/**
 * Inline a Lucide icon that is not registered in `ui/Icon.astro` (keeps that shared file untouched).
 * Output is decorative: aria-hidden, not focusable.
 */
export function lucideSvg(source: string, size = 20, className = ''): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(width|height)="24"/g, '')
    .replace(/class="[^"]*"/, `class="icon ${className}" width="${size}" height="${size}" aria-hidden="true" focusable="false"`)
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}
