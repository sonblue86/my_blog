/**
 * rehype plugin: give h2–h6 readable ASCII ids ("Mô hình ngôn ngữ" -> "mo-hinh-ngon-ngu"),
 * deduplicated per document. Astro's own heading collector reuses existing ids,
 * so the table of contents and anchors always match.
 */

function slugify(input) {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function textOf(node) {
  if (node.type === 'text') return node.value;
  if (Array.isArray(node.children)) return node.children.map(textOf).join('');
  return '';
}

function walk(node, fn) {
  fn(node);
  if (Array.isArray(node.children)) for (const child of node.children) walk(child, fn);
}

export default function rehypeHeadingIds() {
  return (tree) => {
    const seen = new Map();
    walk(tree, (node) => {
      if (node.type !== 'element' || !/^h[2-6]$/.test(node.tagName)) return;
      node.properties ??= {};
      if (node.properties.id) return;
      const base = slugify(textOf(node)) || 'muc';
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      node.properties.id = n ? `${base}-${n}` : base;
    });
  };
}
