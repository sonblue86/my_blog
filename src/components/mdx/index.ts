/**
 * Components available inside .mdx posts WITHOUT importing them, e.g. <Callout type="tip">…</Callout>.
 * Passed as <Content components={mdxComponents} /> in src/pages/bai-viet/[...slug].astro.
 * Hướng dẫn dùng từng component: docs/WRITING.md.
 */
import Callout from './Callout.astro';
import Figure from './Figure.astro';
import YouTube from './YouTube.astro';
import Steps from './Steps.astro';
import ProsCons from './ProsCons.astro';
import KeyPoint from './KeyPoint.astro';
import Kbd from './Kbd.astro';
import Diagram from './Diagram.astro';

export const mdxComponents = {
  Callout,
  Figure,
  YouTube,
  Steps,
  ProsCons,
  KeyPoint,
  Kbd,
  Diagram,
};

export { Callout, Figure, YouTube, Steps, ProsCons, KeyPoint, Kbd, Diagram };
