/**
 * Marks each photo loaded once it has decoded, so global.css can fade it in over its placeholder.
 * Photos added later (story frames, the post pop-up) are picked up as they appear.
 */
function watch(img: HTMLImageElement) {
  if (img.dataset.loaded !== undefined || img.dataset.watched !== undefined) return;
  img.dataset.watched = '';
  const done = () => {
    img.dataset.loaded = '';
  };
  if (img.complete && img.naturalWidth > 0) {
    done();
    return;
  }
  img.addEventListener(
    'load',
    () =>
      void img
        .decode()
        .catch(() => {})
        .finally(done),
    { once: true },
  );
  // A broken image shouldn't stay invisible: show whatever the browser shows.
  img.addEventListener('error', done, { once: true });
}

const scan = (root: ParentNode) =>
  root.querySelectorAll<HTMLImageElement>('img.media-img').forEach(watch);

scan(document);
new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof HTMLImageElement && node.classList.contains('media-img')) watch(node);
      else if (node instanceof Element) scan(node);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

export {};
