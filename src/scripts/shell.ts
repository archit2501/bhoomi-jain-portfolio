/**
 * Opens the shell's drawers and sheets from links marked `data-opens="<dialog id>"`. The link's
 * href stays a real page, so without JavaScript (or on a phone, for the drawers) it navigates.
 */
const DESKTOP = window.matchMedia('(min-width: 768px)');
const DRAWERS = new Set(['panel-search', 'panel-notifications']);
/** Where focus goes back to when a drawer or sheet closes. */
let returnFocusTo: HTMLElement | null = null;

function open(dialog: HTMLDialogElement, from: HTMLElement) {
  for (const other of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) {
    if (other !== dialog) other.close();
  }
  returnFocusTo = from;
  if (DRAWERS.has(dialog.id)) document.documentElement.dataset.panelOpen = dialog.id;
  dialog.showModal();
  dialog.querySelector<HTMLElement>('[data-search-input]')?.focus();
}

document.addEventListener('click', (event) => {
  const link = (event.target as Element).closest<HTMLElement>('[data-opens]');
  if (!link) return;
  const id = link.dataset.opens ?? '';
  const dialog = document.getElementById(id);
  if (!(dialog instanceof HTMLDialogElement)) return;
  // Phones use the full pages, unless the trigger asks for the drawer anywhere (Explore's bar).
  if (DRAWERS.has(id) && !DESKTOP.matches && link.dataset.anywhere === undefined) return;
  event.preventDefault();
  if (dialog.open) dialog.close();
  else open(dialog, link);
});

for (const dialog of document.querySelectorAll<HTMLDialogElement>(
  '#panel-search, #panel-notifications, #create-sheet',
)) {
  // A click on the backdrop (the dialog box itself, outside its content) closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (document.documentElement.dataset.panelOpen === dialog.id) {
      delete document.documentElement.dataset.panelOpen;
    }
    // Safari doesn't focus links on click, so return focus to the opener ourselves.
    if (returnFocusTo?.isConnected) returnFocusTo.focus();
    returnFocusTo = null;
  });
}

// "/" focuses search, as on instagram.com, unless the visitor is typing somewhere.
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const trigger = document.querySelector<HTMLElement>('.side-nav [data-opens="panel-search"]');
  const panel = document.getElementById('panel-search');
  if (!trigger || !(panel instanceof HTMLDialogElement) || !DESKTOP.matches) return;
  event.preventDefault();
  if (!panel.open) open(panel, trigger);
});

export {};
