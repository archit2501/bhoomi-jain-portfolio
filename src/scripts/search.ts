import { prepare, search, type SearchItem, type SearchTab } from '../lib/search';

/**
 * The Search panel (task 4.1.1): results on every keystroke, typos forgiven; tabs for Top,
 * Projects, Stack, Tags and Reels; the visitor's recent picks, kept in this browser only, when
 * the box is empty; and a "no results" state that says what to try.
 */

const RECENT = 'bhoomi:recent-searches';
const MAX_RECENT = 8;

type Recent = Pick<SearchItem, 'title' | 'kind' | 'href' | 'tab'>;

function recents(): Recent[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT) ?? '[]');
    return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function keep(list: Recent[]): void {
  try {
    if (list.length) localStorage.setItem(RECENT, JSON.stringify(list.slice(0, MAX_RECENT)));
    else localStorage.removeItem(RECENT);
  } catch {
    // Storage blocked: search works, it just doesn't remember.
  }
}

/** Which mark a result gets: the tab it belongs to, or what it is. */
function markOf(item: Recent): string {
  if (item.tab === 'projects') return 'grid';
  if (item.tab === 'stack') return 'code';
  if (item.tab === 'reels') return 'reels';
  if (item.tab === 'tags') return 'tag';
  if (item.kind === 'Highlight') return 'play';
  return 'resume';
}

export function initSearch(): void {
  const panel = document.getElementById('panel-search');
  const input = panel?.querySelector<HTMLInputElement>('[data-search-input]');
  const list = panel?.querySelector<HTMLUListElement>('[data-search-results]');
  if (!panel || !input || !list) return;
  const form = panel.querySelector<HTMLFormElement>('[data-search-form]');
  const clear = panel.querySelector<HTMLButtonElement>('[data-search-clear]');
  const tabs = panel.querySelector<HTMLElement>('[data-search-tabs]')!;
  const tabButtons = [...tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const resultsPanel = panel.querySelector<HTMLElement>('[data-search-panel]')!;
  const status = panel.querySelector<HTMLElement>('[data-search-status]')!;
  const hint = panel.querySelector<HTMLElement>('[data-search-hint]')!;
  const empty = panel.querySelector<HTMLElement>('[data-search-empty]')!;
  const emptyTitle = empty.querySelector<HTMLElement>('[data-empty-title]')!;
  const recent = panel.querySelector<HTMLElement>('[data-search-recent]')!;
  const recentList = recent.querySelector<HTMLUListElement>('[data-recent-list]')!;
  const marks = new Map(
    [...panel.querySelectorAll<HTMLTemplateElement>('template[data-mark]')].map((t) => [
      t.dataset.mark!,
      t,
    ]),
  );
  const index = prepare(
    JSON.parse(panel.querySelector('[data-search-index]')?.textContent ?? '[]') as SearchItem[],
  );
  let tab: SearchTab = 'top';

  const row = (item: Recent, removable: boolean) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'result';
    a.href = item.href;
    a.dataset.title = item.title;
    const mark = document.createElement('span');
    mark.className = 'result-mark';
    mark.setAttribute('aria-hidden', 'true');
    const markName = markOf(item);
    const template = marks.get(markName);
    if (template) mark.append(template.content.cloneNode(true));
    else mark.textContent = '#';
    const text = document.createElement('span');
    text.className = 'result-text';
    const title = document.createElement('span');
    title.className = 'result-title';
    title.textContent = item.title;
    const kind = document.createElement('span');
    kind.className = 'result-kind';
    kind.textContent = item.kind;
    text.append(title, kind);
    a.append(mark, text);
    a.addEventListener('click', () => remember(item));
    li.append(a);
    if (removable) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.setAttribute('aria-label', `Remove ${item.title} from recent`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        keep(recents().filter((r) => r.href !== item.href || r.title !== item.title));
        render();
        input.focus();
      });
      li.append(remove);
    }
    return li;
  };

  const remember = (item: Recent) => {
    const { title, kind, href, tab: itemTab } = item;
    const entry: Recent = itemTab ? { title, kind, href, tab: itemTab } : { title, kind, href };
    keep([entry, ...recents().filter((r) => r.href !== href || r.title !== title)]);
  };

  const showRecent = () => {
    const saved = recents();
    recent.hidden = saved.length === 0;
    recentList.replaceChildren(...saved.map((item) => row(item, true)));
    hint.hidden = saved.length > 0;
  };

  const selectTab = (next: SearchTab, focus = false) => {
    tab = next;
    for (const button of tabButtons) {
      const selected = button.dataset.tab === next;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected) {
        resultsPanel.setAttribute('aria-labelledby', button.id);
        if (focus) button.focus();
      }
    }
  };

  function render() {
    const query = input!.value.trim();
    if (clear) clear.hidden = !input!.value;
    tabs.hidden = !query;
    if (!query) {
      selectTab('top');
      list!.replaceChildren();
      empty.hidden = true;
      status.textContent = '';
      showRecent();
      return;
    }
    recent.hidden = true;
    hint.hidden = true;
    const results = search(index, query, tab);
    list!.replaceChildren(...results.map((item) => row(item, false)));
    empty.hidden = results.length > 0;
    emptyTitle.textContent = `No results for "${query}"`;
    status.textContent = results.length
      ? `${results.length} result${results.length === 1 ? '' : 's'}`
      : `No results for "${query}"`;
  }

  input.addEventListener('input', render);

  tabs.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (!button) return;
    selectTab(button.dataset.tab as SearchTab);
    render();
  });

  // Arrow keys, Home and End move between the tabs, as in any tablist.
  tabs.addEventListener('keydown', (event) => {
    const at = tabButtons.findIndex((b) => b.dataset.tab === tab);
    const to =
      event.key === 'ArrowRight'
        ? (at + 1) % tabButtons.length
        : event.key === 'ArrowLeft'
          ? (at - 1 + tabButtons.length) % tabButtons.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabButtons.length - 1
              : -1;
    if (to < 0) return;
    event.preventDefault();
    selectTab(tabButtons[to].dataset.tab as SearchTab, true);
    render();
  });

  clear?.addEventListener('click', () => {
    input.value = '';
    render();
    input.focus();
  });

  recent.querySelector('[data-recent-clear]')?.addEventListener('click', () => {
    keep([]);
    render();
    input.focus();
  });

  form?.addEventListener('submit', (event) => {
    // Enter opens the first result rather than reloading the page.
    const first = list.querySelector<HTMLAnchorElement>('a.result');
    if (first) {
      event.preventDefault();
      first.click();
    }
  });

  render();
}
