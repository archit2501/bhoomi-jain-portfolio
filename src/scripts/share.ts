/** The copy-link button in an action row (a post or a reel): copies its page URL and says so. */
export function initShare(root: HTMLElement): void {
  const share = root.querySelector<HTMLButtonElement>('.action-row .share');
  const status = root.querySelector('.action-row .status');
  share?.addEventListener('click', async () => {
    const url = new URL(share.dataset.href ?? location.pathname, location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      if (status) status.textContent = 'Link copied';
    } catch {
      if (status) status.textContent = `Copy failed. The link is ${url}`;
    }
  });
}
