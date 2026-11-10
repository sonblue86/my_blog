import { describe, expect, it } from 'vitest';
import { BLOCKS, blockMarkdown, esc, inline, isBlock, parseChart, parseNumber, renderBlock, rich, safeUrl, youtubeId } from '../../src/lib/blocks';
import remarkBlocks from '../../src/lib/remark-blocks';
import { renderMarkdown } from '../../src/studio/preview';

const XSS = '<img src=x onerror=alert(1)><script>alert(2)</script>"\'';

describe('escaping', () => {
  it('escapes HTML everywhere text is accepted', () => {
    expect(esc(XSS)).not.toMatch(/[<>"']/);
    expect(inline(XSS)).not.toContain('<img');
    expect(rich([XSS, `- ${XSS}`])).not.toMatch(/<img|<script/);
  });

  it('supports a small inline Markdown subset', () => {
    expect(inline('**đậm** và *nghiêng* với `a < b`')).toBe('<strong>đậm</strong> và <em>nghiêng</em> với <code>a &lt; b</code>');
    expect(inline('[blog](/luu-tru/)')).toBe('<a href="/luu-tru/">blog</a>');
    expect(inline('[x](https://a.dev/?a=1&b=2)')).toBe('<a href="https://a.dev/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>');
    // Markdown inside code stays literal.
    expect(inline('`**không đậm**`')).toBe('<code>**không đậm**</code>');
  });

  it('refuses links that could run script', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl(' JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<script>1</script>')).toBeNull();
    expect(safeUrl('//evil.example/x')).toBeNull();
    expect(safeUrl('https://ok.dev')).toBe('https://ok.dev');
    expect(inline('[bấm](javascript:alert(1))')).not.toContain('<a');
  });

  it('never lets hostile input through any block', () => {
    for (const block of BLOCKS) {
      const hostile = [XSS, `# ${XSS}`, `+ ${XSS}`, `- ${XSS}`, `? ${XSS}`, `${XSS} | ${XSS} | ${XSS}`, `${XSS}: 12`, `title: ${XSS}`, `unit: ${XSS}`, `[x](javascript:alert(1)) | javascript:alert(1)`, `— ${XSS}`].join('\n');
      const html = block.render(hostile);
      // The hostile text may appear only as escaped text, never as a tag or a script link.
      expect(html, block.name).not.toMatch(/<script|<img src=x|href="javascript:/i);
      // Attribute values never contain an unescaped quote from the input (no attribute breakout).
      expect(html, block.name).not.toMatch(/="[^"]*<img/);
    }
  });
});

describe('registry', () => {
  it('knows its blocks and leaves real languages alone', () => {
    expect(isBlock('steps')).toBe(true);
    expect(isBlock(' Tip ')).toBe(true);
    expect(isBlock('ts')).toBe(false);
    expect(isBlock(null)).toBe(false);
    expect(renderBlock('typescript', 'const a = 1')).toBeNull();
    expect(new Set(BLOCKS.map((b) => b.name)).size).toBe(BLOCKS.length);
  });

  it('every template renders real content (no "empty" notice)', () => {
    for (const block of BLOCKS) {
      const html = block.render(block.template);
      expect(html, block.name).toContain('class="nb');
      expect(html, block.name).not.toContain('nb-empty');
      expect(blockMarkdown(block.name)).toBe(`\`\`\`${block.name}\n${block.template}\n\`\`\``);
    }
  });

  it('shows a friendly notice for empty blocks', () => {
    for (const block of BLOCKS) expect(block.render('  \n '), block.name).toContain('nb-empty');
  });
});

describe('blocks', () => {
  it('callout: optional title, default label, lists', () => {
    const html = renderBlock('tip', '# Mẹo hay\nDòng một\ntiếp tục.\n\n- a\n- b')!;
    expect(html).toContain('data-type="tip"');
    expect(html).toContain('<p class="nb-callout-title">Mẹo hay</p>');
    expect(html).toContain('<p>Dòng một tiếp tục.</p><ul><li>a</li><li>b</li></ul>');
    expect(renderBlock('warning', 'Chỉ có nội dung')).toContain('<p class="nb-callout-title">Lưu ý</p>');
  });

  it('steps: one item per "# " heading', () => {
    const html = renderBlock('steps', '# Một\nA\n\n# Hai\nB')!;
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('<p class="nb-step-title">Một</p><p>A</p>');
  });

  it('proscons: + and - lines, wrapped lines, custom titles, one-sided', () => {
    const html = renderBlock('proscons', '# Được | Mất\n+ Nhanh\n  và rẻ\n- Khó học\n+ Bền')!;
    expect(html).toContain('Được');
    expect(html).toContain('Mất');
    expect(html).toContain('<span>Nhanh và rẻ</span>');
    expect(html).toContain('<span>Bền</span>');
    expect(html).toContain('<span>Khó học</span>');
    expect(renderBlock('proscons', '+ Chỉ có ưu điểm')).not.toContain('data-kind="cons"');
  });

  it('timeline, flow, stats: "a | b | c" rows', () => {
    expect(renderBlock('timeline', '2017 | Ra đời | Mô tả')).toContain('<span class="nb-tl-when">2017</span>');
    expect(renderBlock('flow', 'A | mô tả\nB')!.match(/<li>/g)).toHaveLength(2);
    expect(renderBlock('stats', '98% | Hài lòng | ghi chú')).toContain('<p class="nb-stat-value">98%</p>');
  });

  it('quote: last "— name" line becomes the caption', () => {
    const html = renderBlock('quote', 'Câu nói hay.\n— Ai đó')!;
    expect(html).toContain('<blockquote><p>Câu nói hay.</p></blockquote>');
    expect(html).toContain('<figcaption>Ai đó</figcaption>');
    expect(renderBlock('quote', 'Không có tác giả')).not.toContain('figcaption');
  });

  it('faq and cards', () => {
    expect(renderBlock('faq', '? Hỏi?\nĐáp.\n? Hỏi 2?\nĐáp 2.')!.match(/<details>/g)).toHaveLength(2);
    expect(renderBlock('cards', '# A\nx\n# B\ny')!.match(/class="nb-card"/g)).toHaveLength(2);
  });

  it('youtube: accepts the usual URL shapes, rejects anything else', () => {
    for (const url of ['dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3s', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ']) {
      expect(youtubeId(url)).toBe('dQw4w9WgXcQ');
    }
    expect(youtubeId('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(renderBlock('youtube', 'https://youtu.be/dQw4w9WgXcQ\nTên video')).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(renderBlock('youtube', 'không phải link')).toContain('nb-empty');
  });

  it('button: first is primary, unsafe links are dropped', () => {
    const html = renderBlock('button', 'Mở | https://a.dev\nĐọc | /luu-tru/\nXấu | javascript:alert(1)')!;
    expect(html.match(/class="nb-button"/g)).toHaveLength(2);
    expect(html).toContain('data-variant="primary" href="https://a.dev" target="_blank"');
    expect(html).toContain('data-variant="ghost" href="/luu-tru/"');
  });
});

describe('chart', () => {
  it('parses numbers written the Vietnamese or English way', () => {
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('1,200')).toBe(1200);
    expect(parseNumber('45%')).toBe(45);
    expect(parseNumber('-3')).toBe(-3);
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
  });

  it('reads settings (English or Vietnamese keys) and data rows', () => {
    const d = parseChart('loại: tròn\ntiêu đề: Thị phần\nđơn vị: %\nA: 60\nB: 40\nghi chú: không phải số');
    expect(d).toEqual({ type: 'pie', title: 'Thị phần', unit: '%', points: [{ label: 'A', value: 60 }, { label: 'B', value: 40 }] });
    expect(parseChart('type: lạ\nA: 1').type).toBe('bar');
  });

  it('bar: widths are relative to the largest value', () => {
    const html = renderBlock('chart', 'unit: %\nA: 50\nB: 25')!;
    expect(html).toContain('style="width:100%"');
    expect(html).toContain('style="width:50%"');
    expect(html).toContain('50%</span>');
  });

  it('pie segments add up to the whole circle', () => {
    const html = renderBlock('chart', 'type: donut\nA: 1\nB: 1\nC: 2')!;
    const dashes = [...html.matchAll(/stroke-dasharray="([\d.]+) /g)].map((m) => Number(m[1]));
    expect(dashes).toEqual([25, 25, 50]);
    expect(html).toContain('data-kind="donut"');
    expect(html).toContain('role="img"');
  });

  it('line: one point per row, inside the viewBox', () => {
    const html = renderBlock('chart', 'type: line\nT1: 10\nT2: 30\nT3: 20')!;
    expect(html.match(/class="nb-line-dot"/g)).toHaveLength(3);
    for (const m of html.matchAll(/cy="([\d.]+)"/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(0);
      expect(Number(m[1])).toBeLessThanOrEqual(240);
    }
  });

  it('handles all-zero and single-value data without NaN', () => {
    for (const type of ['bar', 'column', 'line', 'pie', 'donut']) {
      const html = renderBlock('chart', `type: ${type}\nA: 0`)!;
      expect(html, type).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe('integration', () => {
  it('remark plugin replaces block fences in .md and skips .mdx and real code', () => {
    const tree = () => ({
      type: 'root',
      children: [
        { type: 'code', lang: 'tip', value: 'Xin chào' },
        { type: 'code', lang: 'ts', value: 'const a = 1' },
        { type: 'blockquote', children: [{ type: 'code', lang: 'steps', value: '# A\nb' }] },
      ],
    });
    const md = tree();
    remarkBlocks()(md, { path: 'src/content/posts/a/index.md' });
    expect(md.children[0]).toMatchObject({ type: 'html' });
    expect((md.children[0] as { value: string }).value).toContain('nb-callout');
    expect(md.children[1]).toMatchObject({ type: 'code', lang: 'ts' });
    expect(md.children[2]!.children![0]).toMatchObject({ type: 'html' });

    const mdx = tree();
    remarkBlocks()(mdx, { path: 'src/content/posts/a/index.mdx' });
    expect(mdx.children[0]).toMatchObject({ type: 'code', lang: 'tip' });
  });

  it('studio preview renders blocks, and still refuses raw HTML', () => {
    const html = renderMarkdown('```steps\n# Một\nA\n```\n\n<script>alert(1)</script>\n\n```js\nlet a\n```');
    expect(html).toContain('class="nb nb-steps"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<code class="language-js">');
  });
});
