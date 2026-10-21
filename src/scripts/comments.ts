import { turnstileToken } from './turnstile';

interface ApprovedComment {
  id: string;
  name: string;
  body: string;
  createdAt: number;
}

const NAME_KEY = 'bhoomi:comment-name';
const wide = () => matchMedia('(min-width: 768px)').matches;

const MESSAGES: Record<string, string> = {
  sent: 'Thanks! Bhoomi will read it before it appears.',
  rate_limited: 'That was quick. Try again in a minute.',
  daily_cap: 'Comments are full for today. Try again tomorrow.',
  disabled: 'Comments are off for now.',
  bad_request: 'Add your name and a comment (one link at most).',
  failed: "Couldn't send it. Try again.",
};

function remembered(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function remember(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage blocked: they type it again next time.
  }
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** One comment, built with text nodes only: nothing a visitor typed is parsed as HTML. */
function item(comment: { name: string; body: string }, note: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'visitor-comment';
  const avatar = document.createElement('span');
  avatar.className = 'visitor-initials';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = initialsOf(comment.name);
  const content = document.createElement('div');
  const text = document.createElement('p');
  text.className = 'visitor-text';
  const who = document.createElement('strong');
  who.textContent = comment.name;
  text.append(who, ` ${comment.body}`);
  const meta = document.createElement('p');
  meta.className = 'visitor-meta';
  meta.textContent = note;
  content.append(text, meta);
  li.append(avatar, content);
  return li;
}

const when = (ms: number) =>
  new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);

/**
 * Comments on one post (PostView): approved ones from /api/comments/<post> in the column (desktop)
 * and the sheet (phones); the form sends a new one with a Turnstile token. The visitor's own
 * comment shows straight away, marked as waiting for approval, in this page only.
 */
export function initComments(root: HTMLElement): void {
  const post = root.dataset.slug;
  if (!post) return;
  const lists = [...root.querySelectorAll<HTMLUListElement>('[data-comment-list]')];
  const forms = [...root.querySelectorAll<HTMLFormElement>('[data-comment-form]')];
  const sheet = root.querySelector<HTMLDialogElement>('.comments-sheet');
  const opener = root.querySelector<HTMLButtonElement>('.open-comments');
  const commentButton = root.querySelector<HTMLButtonElement>('.action-row .comment');
  const endpoint = `/api/comments/${encodeURIComponent(post)}`;
  let approved = 0;

  const label = () => {
    if (opener) opener.textContent = approved ? `View all ${approved} comments` : 'Add a comment…';
  };

  const add = (li: () => HTMLLIElement) => {
    for (const list of lists) {
      list.append(li());
      list.hidden = false;
    }
  };

  const off = () => {
    for (const el of [...forms, opener, commentButton]) el?.setAttribute('hidden', '');
  };

  void fetch(endpoint, { credentials: 'same-origin' })
    .then(async (res) => {
      if (res.status === 503) return off();
      if (!res.ok) return;
      const { comments } = (await res.json()) as { comments: ApprovedComment[] };
      approved = comments.length;
      for (const comment of comments) add(() => item(comment, when(comment.createdAt)));
      label();
    })
    .catch(() => {
      // No API (offline, or a static preview): the form still tries when used.
    });

  const open = () => {
    if (wide() || !sheet) {
      forms[0]?.querySelector<HTMLElement>('.comment-body')?.focus();
      return;
    }
    if (!sheet.open) sheet.showModal();
    sheet.querySelector<HTMLElement>('.comment-body')?.focus();
  };
  opener?.addEventListener('click', open);
  commentButton?.addEventListener('click', open);
  sheet?.querySelector('.sheet-close')?.addEventListener('click', () => sheet.close());

  /** 'sent', or the server's error code ('rate_limited', 'disabled', …), or 'failed'. */
  const send = async (comment: { name: string; body: string }): Promise<string> => {
    try {
      const turnstile = await turnstileToken('comment');
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...comment, turnstile }),
      });
      if (res.ok) return 'sent';
      return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'failed';
    } catch {
      return 'failed';
    }
  };

  for (const form of forms) {
    const name = form.querySelector<HTMLInputElement>('.comment-name')!;
    const body = form.querySelector<HTMLTextAreaElement>('.comment-body')!;
    const button = form.querySelector<HTMLButtonElement>('.comment-post')!;
    const status = form.querySelector<HTMLElement>('.comment-status')!;
    name.value = remembered();

    // Enter sends, Shift+Enter starts a new line, as in a chat box.
    body.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const comment = { name: name.value.trim(), body: body.value.trim() };
      if (!comment.name || !comment.body) {
        status.textContent = MESSAGES.bad_request;
        (comment.name ? body : name).focus();
        return;
      }
      button.disabled = true;
      status.textContent = 'Sending…';
      const outcome = await send(comment);
      button.disabled = false;
      status.textContent = MESSAGES[outcome] ?? MESSAGES.failed;
      if (outcome === 'disabled') off();
      if (outcome !== 'sent') return;
      remember(comment.name);
      body.value = '';
      add(() => item(comment, 'Waiting for Bhoomi’s approval'));
    });
  }
}
