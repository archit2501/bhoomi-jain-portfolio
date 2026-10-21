import { neighbor, postSlugFromPath } from '../lib/post-nav';
import { enhancePostView } from './post-view';

const WIDE = '(min-width: 768px)';

/**
 * Desktop post pop-up, as on instagram.com: a grid tile opens the post in a <dialog> and the URL
 * becomes /p/<slug>/. Left/right move between posts (replacing the URL), Esc, the close button,
 * a backdrop click or browser Back close it, and focus returns to the tile. Under 768px tiles
 * keep navigating to the post page, which is Instagram's mobile behaviour.
 */
export function initPostModal(): void {
  const dialog = document.getElementById('post-modal') as HTMLDialogElement | null;
  const body = dialog?.querySelector<HTMLElement>('.modal-body');
  const prevButton = dialog?.querySelector<HTMLButtonElement>('.post-prev');
  const nextButton = dialog?.querySelector<HTMLButtonElement>('.post-next');
  if (!dialog || !body || !prevButton || !nextButton) return;

  let current: string | null = null;
  let returnUrl = '/';
  let returnTitle = document.title;

  const order = () =>
    [...document.querySelectorAll<HTMLAnchorElement>('#panel-posts a[data-post]')].map(
      (a) => a.dataset.post ?? '',
    );
  const tile = (slug: string) =>
    document.querySelector<HTMLAnchorElement>(`#panel-posts a[data-post="${slug}"]`);

  const show = (slug: string): boolean => {
    const template = document.getElementById(`post-template-${slug}`) as HTMLTemplateElement | null;
    if (!template) return false;
    body.replaceChildren(template.content.cloneNode(true));
    const view = body.querySelector<HTMLElement>('.post-view');
    if (view) enhancePostView(view);
    dialog.setAttribute('aria-labelledby', `post-title-${slug}`);
    current = slug;
    prevButton.hidden = !neighbor(order(), slug, -1);
    nextButton.hidden = !neighbor(order(), slug, 1);
    if (template.dataset.title) document.title = template.dataset.title;
    if (!dialog.open) dialog.showModal();
    return true;
  };

  const open = (slug: string) => {
    returnUrl = location.pathname;
    returnTitle = document.title;
    const from = tile(slug);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!from || reduced || !document.startViewTransition) {
      if (show(slug)) history.pushState({ post: slug }, '', `/p/${slug}/`);
      return;
    }
    // The tile grows into the pop-up's media: the name moves from one to the other mid-transition.
    let media: HTMLElement | null = null;
    dialog.classList.add('in-view-transition');
    const transition = document.startViewTransition(() => {
      from.style.setProperty('view-transition-name', 'none');
      if (!show(slug)) return;
      history.pushState({ post: slug }, '', `/p/${slug}/`);
      media = body.querySelector<HTMLElement>('.media');
      media?.style.setProperty('view-transition-name', `post-${slug}`);
    });
    void transition.finished.finally(() => {
      dialog.classList.remove('in-view-transition');
      from.style.removeProperty('view-transition-name');
      media?.style.removeProperty('view-transition-name');
    });
  };

  const step = (direction: 1 | -1) => {
    if (!current) return;
    const slug = neighbor(order(), current, direction);
    if (slug && show(slug)) history.replaceState({ post: slug }, '', `/p/${slug}/`);
  };

  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('#panel-posts a[data-post]');
    if (!link || !matchMedia(WIDE).matches) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    open(link.dataset.post ?? '');
  });

  prevButton.addEventListener('click', () => step(-1));
  nextButton.addEventListener('click', () => step(1));
  dialog.querySelector('.post-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'ArrowLeft') step(-1);
  });

  dialog.addEventListener('close', () => {
    // The close event fires a task after close(). If Back then Forward already reopened the
    // pop-up in between, this event is stale and must not clear the new post.
    if (dialog.open) return;
    const slug = current;
    current = null;
    body.replaceChildren();
    document.title = returnTitle;
    if (postSlugFromPath(location.pathname)) {
      if (history.state?.post) history.back();
      else history.replaceState({}, '', returnUrl);
    }
    if (slug) tile(slug)?.focus();
  });

  window.addEventListener('popstate', () => {
    const slug = postSlugFromPath(location.pathname);
    if (slug && history.state?.post) show(slug);
    else if (dialog.open) dialog.close();
  });
}
