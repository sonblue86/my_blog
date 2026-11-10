import { describe, expect, it } from 'vitest';
import { BLOCKS, renderBlock } from '../../src/lib/blocks';
import { blockForm, emptyItem } from '../../src/lib/block-forms';

describe('block forms', () => {
  it('every block has a form whose fields and lists are well formed', () => {
    for (const block of BLOCKS) {
      const form = blockForm(block.name);
      expect(form, block.name).not.toBeNull();
      const keys = [...form!.fields.map((f) => f.key), ...form!.lists.map((l) => l.key)];
      expect(new Set(keys).size, block.name).toBe(keys.length);
      for (const f of form!.fields) if (f.type === 'select') expect(f.options?.length, block.name).toBeGreaterThan(1);
      for (const l of form!.lists) expect(Object.keys(emptyItem(l))).toEqual(l.columns.map((c) => c.key));
    }
    expect(blockForm('typescript')).toBeNull();
  });

  it('parse → serialize keeps every template rendering exactly the same', () => {
    for (const block of BLOCKS) {
      const form = blockForm(block.name)!;
      const again = form.serialize(form.parse(block.template));
      expect(renderBlock(block.name, again), block.name).toBe(renderBlock(block.name, block.template));
      // …and is stable: a second round changes nothing.
      expect(form.serialize(form.parse(again)), block.name).toBe(again);
    }
  });

  it('an empty block parses to an empty model and serialises to (almost) nothing', () => {
    for (const block of BLOCKS) {
      const form = blockForm(block.name)!;
      const model = form.parse('');
      for (const l of form.lists) expect(model.lists[l.key], block.name).toEqual([]);
      const out = form.serialize(model);
      expect(renderBlock(block.name, out), block.name).toContain('nb-empty');
    }
  });

  it('callout: title is optional', () => {
    const form = blockForm('tip')!;
    expect(form.parse('# Mẹo\nDòng 1\n\n- a')).toEqual({ fields: { title: 'Mẹo', body: 'Dòng 1\n\n- a' }, lists: {} });
    expect(form.parse('Chỉ nội dung').fields).toEqual({ title: '', body: 'Chỉ nội dung' });
    expect(form.serialize({ fields: { title: ' ', body: 'x' }, lists: {} })).toBe('x');
  });

  it('steps: edits, reordering and empty items', () => {
    const form = blockForm('steps')!;
    const model = form.parse('# Một\nA\n\n# Hai\nB');
    expect(model.lists.items).toEqual([{ title: 'Một', body: 'A' }, { title: 'Hai', body: 'B' }]);
    model.lists.items!.reverse();
    model.lists.items!.push({ title: '', body: '' }, { title: '', body: 'Chỉ có mô tả' });
    expect(form.serialize(model)).toBe('# Hai\nB\n\n# Một\nA\n\n# …\nChỉ có mô tả');
  });

  it('text typed in a form can never break the structure of its block', () => {
    // "#" at the start of a step description must not start a new step
    const steps = blockForm('steps')!;
    const s = steps.serialize({ fields: {}, lists: { items: [{ title: 'Một\nhai', body: 'dòng\n# không phải bước' }] } });
    expect(steps.parse(s).lists.items).toHaveLength(1);
    expect(steps.parse(s).lists.items![0]!.title).toBe('Một hai');

    // "|" inside a cell must not create a new column, a line break must not create a new row
    const tl = blockForm('timeline')!;
    const t = tl.serialize({ fields: {}, lists: { rows: [{ when: '2020 | 2021', title: 'A\nB', desc: 'x' }] } });
    expect(tl.parse(t).lists.rows).toEqual([{ when: '2020 / 2021', title: 'A B', desc: 'x' }]);

    // ":" inside a chart label must not be read as the label/value separator
    const chart = blockForm('chart')!;
    const c = chart.serialize({ fields: { type: 'pie', title: '', unit: '' }, lists: { rows: [{ label: 'Tỉ lệ: nam', value: '12,5' }] } });
    expect(chart.parse(c).lists.rows).toEqual([{ label: 'Tỉ lệ – nam', value: '12,5' }]);

    // "?" at the start of an answer line must not start a new question
    const faq = blockForm('faq')!;
    const f = faq.serialize({ fields: {}, lists: { items: [{ q: 'Hỏi?', a: 'Đáp.\n? vẫn là câu trả lời' }] } });
    expect(faq.parse(f).lists.items).toHaveLength(1);
  });

  it('rows: trailing empty cells are dropped, empty rows removed, last column keeps extra "|"', () => {
    const stats = blockForm('stats')!;
    expect(stats.serialize({ fields: {}, lists: { rows: [{ value: '98%', label: 'Hài lòng', note: '' }, { value: '', label: '', note: '' }, { value: '3×', label: '', note: '' }] } })).toBe(
      '98% | Hài lòng\n3×',
    );
    expect(blockForm('timeline')!.parse('2020 | A | b | c').lists.rows).toEqual([{ when: '2020', title: 'A', desc: 'b | c' }]);
  });

  it('proscons: custom titles round-trip, defaults are not written', () => {
    const form = blockForm('proscons')!;
    const model = form.parse('# Được | Mất\n+ Nhanh\n  và rẻ\n- Khó');
    expect(model.fields).toEqual({ prosTitle: 'Được', consTitle: 'Mất' });
    expect(model.lists.pros).toEqual([{ text: 'Nhanh và rẻ' }]);
    expect(form.serialize(model)).toBe('# Được | Mất\n+ Nhanh và rẻ\n- Khó');
    expect(form.serialize(form.parse('+ a\n- b'))).toBe('+ a\n- b');
  });

  it('chart: keeps numbers as typed and all settings', () => {
    const form = blockForm('chart')!;
    const model = form.parse('type: donut\ntitle: Thị phần\nunit: %\nA: 1.234,5\nB: 40');
    expect(model.fields).toEqual({ type: 'donut', title: 'Thị phần', unit: '%' });
    expect(model.lists.rows).toEqual([{ label: 'A', value: '1.234,5' }, { label: 'B', value: '40' }]);
    expect(form.serialize(model)).toBe('type: donut\ntitle: Thị phần\nunit: %\nA: 1.234,5\nB: 40');
  });

  it('quote and youtube', () => {
    const quote = blockForm('quote')!;
    expect(quote.parse('Câu nói.\n— Ai đó').fields).toEqual({ text: 'Câu nói.', author: 'Ai đó' });
    expect(quote.serialize({ fields: { text: 'Câu nói.', author: '' }, lists: {} })).toBe('Câu nói.');
    const yt = blockForm('youtube')!;
    expect(yt.parse('https://youtu.be/dQw4w9WgXcQ\nTên').fields).toEqual({ url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Tên' });
  });
});
