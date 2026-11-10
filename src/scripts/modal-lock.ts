/**
 * Lock page scrolling while any modal <dialog> is open (mobile menu, sheets, palette, lightbox…).
 * Without it, scrolling past the end of a sheet scrolls the article behind it.
 * One central hook instead of per-dialog code, and no `html:has(dialog:modal)` (it re-styles the whole page).
 */
const proto = HTMLDialogElement.prototype;
const marker = '__nsModalLock';

if (!(proto as unknown as Record<string, unknown>)[marker]) {
  (proto as unknown as Record<string, unknown>)[marker] = true;
  const showModal = proto.showModal;
  const root = document.documentElement;

  const sync = () => {
    const anyModal = [...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal'));
    root.toggleAttribute('data-modal-open', anyModal);
  };

  proto.showModal = function (this: HTMLDialogElement) {
    showModal.call(this);
    sync();
    this.addEventListener('close', sync, { once: true });
  };
}
