import { asOf, type GithubSnapshot } from '../lib/github';

/**
 * Insights' GitHub section (task 4.2.1): GitHub's own numbers from the hourly snapshot, with the
 * time they were true, or a plain "unavailable". Never a placeholder number.
 */
export function initGithub(): void {
  const section = document.querySelector<HTMLElement>('[data-github]');
  if (!section) return;
  const state = section.querySelector<HTMLElement>('[data-github-state]')!;
  const figures = section.querySelector<HTMLElement>('[data-github-figures]')!;
  const source = section.querySelector<HTMLElement>('[data-github-source]')!;
  state.textContent = 'Loading her GitHub activity…';

  const unavailable = () => {
    state.textContent = 'Her GitHub activity is unavailable right now.';
    figures.hidden = true;
    source.hidden = true;
  };

  void fetch('/api/github')
    .then(async (res) => {
      const body = (await res.json()) as { ok: boolean; snapshot?: GithubSnapshot };
      if (!res.ok || !body.ok || !body.snapshot) return unavailable();
      const snapshot = body.snapshot;
      for (const el of figures.querySelectorAll<HTMLElement>('[data-figure]')) {
        const value = snapshot[el.dataset.figure as keyof GithubSnapshot];
        el.textContent = typeof value === 'number' ? value.toLocaleString('en') : '';
      }
      section.querySelector<HTMLAnchorElement>('[data-github-link]')!.href = snapshot.url;
      section.querySelector('[data-github-asof]')!.textContent = asOf(snapshot.fetchedAt);
      state.textContent = '';
      figures.hidden = false;
      source.hidden = false;
    })
    .catch(unavailable);
}
