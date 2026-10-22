/**
 * The share sheet (src/components/share/ShareSheet.astro): opens from any [data-open-share],
 * copies her link, shares it through the device where it can, and shows or hides the QR card.
 */
export function initShareSheet(): void {
  const sheet = document.getElementById('share-sheet') as HTMLDialogElement | null;
  if (!sheet) return;
  const url = sheet.dataset.shareUrl ?? location.origin;
  const title = sheet.dataset.shareTitle ?? document.title;
  const status = sheet.querySelector<HTMLElement>('[data-share-status]')!;
  let opener: HTMLElement | null = null;

  document.querySelectorAll<HTMLElement>('[data-open-share]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      opener = trigger;
      status.textContent = '';
      sheet.showModal();
    });
  });
  // Safari doesn't focus a button on click: give focus back to the opener ourselves.
  sheet.addEventListener('close', () => opener?.focus());
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) sheet.close();
  });
  sheet.querySelector('[data-close]')?.addEventListener('click', () => sheet.close());

  sheet.querySelector('[data-share-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Link copied';
    } catch {
      status.textContent = `Copy failed. The link is ${url}`;
    }
  });

  // "Share to…" only where the device has a share sheet of its own.
  const native = sheet.querySelector<HTMLElement>('[data-share-native]');
  if (native && typeof navigator.share === 'function') {
    native.hidden = false;
    native.querySelector('button')?.addEventListener('click', async () => {
      try {
        await navigator.share({ title, url });
      } catch {
        // Cancelled, or not allowed here: nothing to say.
      }
    });
  }

  const card = sheet.querySelector<HTMLElement>('[data-share-qr]');
  const toggle = sheet.querySelector<HTMLButtonElement>('[data-share-qr-toggle]');
  toggle?.addEventListener('click', () => {
    if (!card) return;
    card.hidden = !card.hidden;
    toggle.setAttribute('aria-expanded', String(!card.hidden));
  });
}
