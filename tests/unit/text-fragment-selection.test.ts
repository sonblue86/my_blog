// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { readSelection, expandToWords, countWords } from '../../src/scripts/selection-share';
import { encodeFragmentTerm } from '../../src/scripts/text-fragment';

function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Selection {
  const r = document.createRange();
  r.setStart(startNode, startOffset);
  r.setEnd(endNode, endOffset);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
  return sel;
}
const text = (sel: string) => document.querySelector(sel)!.firstChild as Text;

describe('selection → share info', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = `
      <p id="outside">Đoạn ngoài bài viết có nhiều chữ lắm.</p>
      <div id="post-body">
        <p id="a">Đọc chậm, đọc sâu trở thành một kỹ năng quý giá.</p>
        <p id="b">Token là đơn vị nhỏ nhất mà mô hình xử lý.</p>
        <p id="c">Có <code id="code">const token = 1</code> ở đây.</p>
        <p id="d">Mỗi ngày đọc chậm một chút.</p>
      </div>`;
    root = document.getElementById('post-body')!;
  });

  it('counts words', () => {
    expect(countWords(' Đọc  chậm, — sâu ')).toBe(3);
  });

  it('ignores short, collapsed, outside and code selections', () => {
    const a = text('#a');
    expect(readSelection(root, select(a, 0, a, 9))).toBeNull(); // "Đọc chậm" = 2 words
    expect(readSelection(root, select(a, 3, a, 3))).toBeNull();
    const out = text('#outside');
    expect(readSelection(root, select(out, 0, out, 20))).toBeNull();
    const code = text('#code');
    expect(readSelection(root, select(code, 0, code, 15))).toBeNull();
  });

  it('expands partial words at both edges', () => {
    const a = text('#a'); // "Đọc chậm, đọc sâu trở thành..."
    const r = document.createRange();
    r.setStart(a, 5); // inside "chậm"
    r.setEnd(a, 15); // inside "sâu"
    expect(expandToWords(r).toString()).toBe('chậm, đọc sâu');
  });

  it('builds a quote and an exact text fragment for a short single-block selection', () => {
    const b = text('#b');
    const info = readSelection(root, select(b, 0, b, 19))!; // "Token là đơn vị nhỏ"
    expect(info.quote).toBe('Token là đơn vị nhỏ');
    expect(info.hash).toBe(`#:~:text=${encodeFragmentTerm('Token là đơn vị nhỏ')}`);
  });

  it('uses textStart,textEnd across paragraphs, one part per block', () => {
    const a = text('#a');
    const b = text('#b');
    const info = readSelection(root, select(a, 10, b, 15))!; // "đọc sâu … quý giá." + "Token là đơn vị"
    expect(info.parts).toEqual(['đọc sâu trở thành một kỹ năng quý giá.', 'Token là đơn vị']);
    expect(info.quote).toBe('đọc sâu trở thành một kỹ năng quý giá.\nToken là đơn vị');
    expect(info.hash).toBe(`#:~:text=${encodeFragmentTerm('đọc sâu trở thành')},${encodeFragmentTerm('Token là đơn vị')}`);
  });

  it('adds no context when the quote is unique', () => {
    const d = text('#d'); // "Mỗi ngày đọc chậm một chút."
    const info = readSelection(root, select(d, 9, d, 22))!;
    expect(info.quote).toBe('đọc chậm một');
    expect(info.hash).toBe(`#:~:text=${encodeFragmentTerm('đọc chậm một')}`);
  });

  it('adds prefix context for a genuinely repeated phrase', () => {
    root.insertAdjacentHTML('beforeend', '<p id="e">Hôm nay tôi đọc sâu trở thành thói quen.</p>');
    const e = text('#e');
    const start = e.data.indexOf('đọc');
    const info = readSelection(root, select(e, start, e, start + 'đọc sâu trở thành'.length))!;
    expect(info.hash).toBe(`#:~:text=${encodeFragmentTerm('Hôm nay tôi')}-,${encodeFragmentTerm('đọc sâu trở thành')}`);
  });
});
