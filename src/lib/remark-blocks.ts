/**
 * remark plugin: turns "khối nội dung" fences (```steps, ```tip, ```chart …) in .md posts into their
 * HTML at build time, using the same renderer as the writing studio (src/lib/blocks.ts).
 *
 * Runs on the Markdown tree, i.e. before Expressive Code sees the code block.
 * .mdx files are left alone: MDX drops raw HTML nodes, and MDX posts have real components
 * (<Callout>, <Steps>…) for the same job.
 */
import { renderBlock } from './blocks';

interface Node {
  type: string;
  lang?: string | null;
  value?: string;
  children?: Node[];
}

function walk(node: Node) {
  if (!node.children) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!;
    if (child.type === 'code') {
      const html = renderBlock(child.lang, child.value ?? '');
      if (html !== null) node.children[i] = { type: 'html', value: html };
    } else {
      walk(child);
    }
  }
}

export default function remarkBlocks() {
  return (tree: Node, file: { path?: string; history?: string[] }) => {
    const path = file.path ?? file.history?.[0] ?? '';
    if (/\.mdx$/i.test(path)) return;
    walk(tree);
  };
}
