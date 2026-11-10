/**
 * The block editor dialog of the writing studio: edit a "khối nội dung" with ordinary inputs and a
 * live preview, instead of its text syntax. Works for every block through its form description
 * (src/lib/block-forms.ts) — there is no per-block UI code here.
 *
 * All author text goes into the DOM through .value / textContent. The only innerHTML is the preview,
 * which comes from renderBlock() (it escapes everything itself).
 */
import { BLOCKS, renderBlock } from '../lib/blocks';
import { blockForm, emptyItem, type BlockModel, type FormField, type FormList } from '../lib/block-forms';

export type BlockFormResult = { action: 'apply'; name: string; source: string } | { action: 'delete' } | null;

export interface BlockFormOptions {
  name: string;
  source: string;
  mode: 'insert' | 'edit';
  /** Asked when the author closes the dialog with unsaved edits. */
  confirmDiscard: () => Promise<boolean>;
}

/** Callout kinds share one form; the author can switch between them inside the dialog. */
const CALLOUT_KINDS = ['note', 'tip', 'warning', 'danger', 'success'];

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

const grow = (area: HTMLTextAreaElement) => {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
};

export function openBlockForm(opts: BlockFormOptions): Promise<BlockFormResult> {
  const dialog = $<HTMLDialogElement>('[data-blockform]');
  const formHost = $('[data-bf-form]', dialog);
  const preview = $('[data-bf-preview]', dialog);
  const applyBtn = $<HTMLButtonElement>('[data-bf-apply]', dialog);
  const deleteBtn = $<HTMLButtonElement>('[data-bf-delete]', dialog);
  const cancelBtn = $<HTMLButtonElement>('[data-bf-cancel]', dialog);
  const closeBtn = $<HTMLButtonElement>('[data-bf-close]', dialog);

  let name = opts.name.trim().toLowerCase();
  const form = blockForm(name);
  const def = BLOCKS.find((b) => b.name === name);
  if (!form || !def) return Promise.resolve(null);

  const model: BlockModel = form.parse(opts.source);
  for (const f of form.fields) model.fields[f.key] ??= '';
  for (const l of form.lists) model.lists[l.key] ??= [];
  const initial = JSON.stringify([name, model]);
  const dirty = () => JSON.stringify([name, model]) !== initial;

  $('[data-bf-title]', dialog).textContent = opts.mode === 'insert' ? `Chèn khối: ${def.label}` : `Sửa khối: ${def.label}`;
  $('[data-bf-desc]', dialog).textContent = def.description;
  applyBtn.textContent = opts.mode === 'insert' ? 'Chèn vào bài' : 'Xong';
  deleteBtn.hidden = opts.mode !== 'edit';

  /* ---------------------------------------------------------------- preview */

  let frame = 0;
  const paint = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      preview.innerHTML = renderBlock(name, form.serialize(model)) ?? '';
    });
  };

  /* ----------------------------------------------------------------- inputs */

  function control(field: FormField, get: () => string, set: (v: string) => void, labelled: boolean): HTMLElement {
    if (field.type === 'select') {
      const group = el('div', { class: 'bf-chips', role: 'group', 'aria-label': field.label });
      for (const o of field.options ?? []) {
        const chip = el('button', { type: 'button', class: 'bf-chip', 'aria-pressed': String(get() === o.value), text: o.label });
        chip.addEventListener('click', () => {
          set(o.value);
          group.querySelectorAll('.bf-chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
          paint();
        });
        group.append(chip);
      }
      return group;
    }
    const input =
      field.type === 'textarea'
        ? el('textarea', { class: 'st-input bf-area', rows: '2', placeholder: field.placeholder ?? '' })
        : el('input', { class: 'st-input', type: 'text', placeholder: field.placeholder ?? '', autocomplete: 'off' });
    if (!labelled) input.setAttribute('aria-label', field.label);
    input.value = get();
    input.dataset.col = field.key;
    // A new block starts with example text: the first focus selects it, so typing replaces it.
    if (opts.mode === 'insert') input.addEventListener('focus', () => input.select(), { once: true });
    input.addEventListener('input', () => {
      set(input.value);
      if (input instanceof HTMLTextAreaElement) grow(input);
      paint();
    });
    return input;
  }

  function fieldRow(field: FormField): HTMLElement {
    const node = control(field, () => model.fields[field.key] ?? '', (v) => (model.fields[field.key] = v), true);
    return el('label', { class: 'st-field' }, el('span', { class: 'st-label', text: field.label }), node);
  }

  function listSection(list: FormList): HTMLElement {
    const items = model.lists[list.key]!;
    const inline = list.columns.every((c) => c.type === 'text');
    const host = el('div', { class: 'bf-items' });
    const section = el('section', { class: 'bf-list' }, el('p', { class: 'st-label', text: form!.lists.length > 1 ? list.label : `${list.label.trim()} (${items.length})` }), host);
    const heading = section.firstElementChild as HTMLElement;

    const focusItem = (index: number, col = 0) => {
      const inputs = host.children[index]?.querySelectorAll<HTMLElement>('input, textarea');
      inputs?.[Math.min(col, inputs.length - 1)]?.focus();
    };

    const draw = () => {
      host.replaceChildren(
        ...items.map((item, index) => {
          const tool = (label: string, glyph: string, disabled: boolean, run: () => void) => {
            const b = el('button', { type: 'button', class: 'bf-tool', 'aria-label': `${label} ${list.item.toLowerCase()} ${index + 1}`, title: label, text: glyph });
            b.disabled = disabled;
            b.addEventListener('click', run);
            return b;
          };
          const move = (to: number) => {
            items.splice(to, 0, ...items.splice(index, 1));
            draw();
            paint();
            (host.children[to]?.querySelector<HTMLElement>(`.bf-tool[title="${to < index ? 'Đưa lên' : 'Đưa xuống'}"]:not(:disabled)`) ?? host.children[to]?.querySelector<HTMLElement>('input, textarea'))?.focus();
          };
          const tools = el(
            'div',
            { class: 'bf-tools' },
            tool('Đưa lên', '↑', index === 0, () => move(index - 1)),
            tool('Đưa xuống', '↓', index === items.length - 1, () => move(index + 1)),
            tool('Xoá', '✕', false, () => {
              items.splice(index, 1);
              draw();
              paint();
              if (items.length) focusItem(Math.min(index, items.length - 1));
              else add.focus();
            }),
          );
          const cols = el(
            'div',
            { class: inline ? 'bf-cols bf-cols-inline' : 'bf-cols' },
            ...list.columns.map((c) => {
              const node = control(c, () => item[c.key] ?? '', (v) => (item[c.key] = v), false);
              if (inline) node.style.flexGrow = String(c.grow ?? 1);
              return node;
            }),
          );
          return el('div', { class: 'bf-item' }, el('span', { class: 'bf-num', 'aria-hidden': 'true', text: String(index + 1) }), cols, tools);
        }),
      );
      if (form!.lists.length === 1) heading.textContent = `${list.label.trim()} (${items.length})`;
      host.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(grow);
    };

    const add = el('button', { type: 'button', class: 'bf-add', text: `+ Thêm ${list.item.toLowerCase()}` });
    const addItem = (at = items.length) => {
      items.splice(at, 0, emptyItem(list));
      draw();
      paint();
      focusItem(at);
    };
    add.addEventListener('click', () => addItem());

    // Enter in a one-line row = "next row", like a spreadsheet.
    host.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.shiftKey || !(target instanceof HTMLInputElement)) return;
      e.preventDefault();
      const index = [...host.children].indexOf(target.closest('.bf-item')!);
      if (index === items.length - 1) addItem();
      else focusItem(index + 1, [...target.parentElement!.children].indexOf(target));
    });

    if (list.columns.length > 1 && inline) {
      section.insertBefore(
        el('div', { class: 'bf-colhead', 'aria-hidden': 'true' }, ...list.columns.map((c) => {
          const h = el('span', { text: c.label });
          h.style.flexGrow = String(c.grow ?? 1);
          return h;
        })),
        host,
      );
    }
    section.append(add);
    draw();
    return section;
  }

  function build() {
    const nodes: HTMLElement[] = [];
    if (CALLOUT_KINDS.includes(name)) {
      const kinds: FormField = {
        key: '__kind',
        label: 'Loại hộp',
        type: 'select',
        options: CALLOUT_KINDS.map((k) => ({ value: k, label: BLOCKS.find((b) => b.name === k)!.label })),
      };
      nodes.push(el('div', { class: 'st-field' }, el('span', { class: 'st-label', text: kinds.label }), control(kinds, () => name, (v) => (name = v), true)));
    }
    if (form!.hint) nodes.push(el('p', { class: 'st-hint', text: form!.hint }));
    const single = form!.fields.filter((f) => f.type !== 'textarea' && f.type !== 'select');
    for (const f of form!.fields) {
      // Two short text fields sit side by side (e.g. chart title + unit).
      if (single.length === 2 && f === single[0]) nodes.push(el('div', { class: 'st-two' }, fieldRow(single[0]!), fieldRow(single[1]!)));
      else if (single.length === 2 && f === single[1]) continue;
      else nodes.push(fieldRow(f));
    }
    for (const l of form!.lists) nodes.push(listSection(l));
    formHost.replaceChildren(...nodes);
  }

  build();
  preview.innerHTML = renderBlock(name, form.serialize(model)) ?? '';

  /* ------------------------------------------------------------------ close */

  return new Promise<BlockFormResult>((resolve) => {
    const ac = new AbortController();
    const finish = (result: BlockFormResult) => {
      ac.abort();
      cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
      formHost.replaceChildren();
      preview.replaceChildren();
      resolve(result);
    };
    const cancel = async () => {
      if (!dirty() || (await opts.confirmDiscard())) finish(null);
    };
    const apply = () => finish({ action: 'apply', name, source: form.serialize(model) });
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void) =>
      target.addEventListener(type, fn as EventListener, { signal: ac.signal });

    on(applyBtn, 'click', apply);
    on(cancelBtn, 'click', () => void cancel());
    on(closeBtn, 'click', () => void cancel());
    on(deleteBtn, 'click', () => finish({ action: 'delete' }));
    // Esc: never lose edits silently.
    on(dialog, 'cancel', (e) => {
      e.preventDefault();
      void cancel();
    });
    on(dialog, 'keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        apply();
      }
    });

    dialog.showModal();
    formHost.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(grow); // measurable only once visible
    formHost.querySelector<HTMLElement>('input, textarea')?.focus();
  });
}
