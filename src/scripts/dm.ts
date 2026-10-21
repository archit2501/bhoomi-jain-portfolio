import { turnstileToken } from './turnstile';

/**
 * Messages (DmShell): starting a conversation, reading one from its private link, and writing
 * again. Conversations the visitor started are listed from this browser's storage; the key to
 * each lives only in the link's fragment and here.
 */

interface Saved {
  id: string;
  secret: string;
  topic: string;
  label: string;
  last: string;
  at: number;
}

interface Message {
  id: string;
  sender: 'visitor' | 'bhoomi' | 'ai';
  body: string;
  createdAt: number;
}

const STORE = 'bhoomi:dm-threads';
const POLL_MS = 20_000;

const MESSAGES: Record<string, string> = {
  rate_limited: 'That was quick. Try again in a minute.',
  daily_cap: 'Messages are full for today. Try again tomorrow.',
  disabled: 'Messages are off for now. Email her instead (see her profile).',
  bad_request: 'Add your name and a message, and a valid email if you give one.',
  not_found: "This conversation can't be found. Check the link.",
  failed: "Couldn't send it. Try again.",
};

function saved(): Saved[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(entry: Saved): void {
  try {
    const rest = saved().filter((s) => s.id !== entry.id);
    localStorage.setItem(STORE, JSON.stringify([entry, ...rest].slice(0, 20)));
  } catch {
    // Storage blocked: the private link still works.
  }
}

const threadUrl = (id: string, secret: string) => `/direct/thread/#${id}.${secret}`;

/** "Your conversations": what this browser started, newest first. */
function listMine(): void {
  const section = document.querySelector<HTMLElement>('[data-my-threads]');
  const rows = section?.querySelector('[data-my-thread-rows]');
  const mine = saved();
  if (!section || !rows || !mine.length) return;
  rows.replaceChildren(
    ...mine.map((entry) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'row';
      a.href = threadUrl(entry.id, entry.secret);
      if (location.hash.slice(1) === `${entry.id}.${entry.secret}`) {
        a.setAttribute('aria-current', 'page');
      }
      const mark = document.createElement('span');
      mark.className = 'row-initials';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = 'You';
      const text = document.createElement('span');
      text.className = 'row-text';
      const title = document.createElement('span');
      title.className = 'row-title';
      title.textContent = entry.label;
      const preview = document.createElement('span');
      preview.className = 'row-preview';
      preview.textContent = entry.last;
      text.append(title, preview);
      a.append(mark, text);
      li.append(a);
      return li;
    }),
  );
  section.hidden = false;
}

/** Bubbles for a run of messages, grouped as Instagram groups a sender's consecutive messages. */
function bubbles(messages: { sender: Message['sender']; body: string }[], herName: string) {
  return messages.map((message, i) => {
    const mine = message.sender === 'visitor';
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const li = document.createElement('li');
    li.className = `msg ${mine ? 'from-you' : 'from-her'}`;
    if (prev && (prev.sender === 'visitor') === mine) li.classList.add('grouped');
    if (next && (next.sender === 'visitor') === mine) li.classList.add('continues');
    if (!mine) {
      const space = document.createElement('span');
      space.className = 'avatar-space';
      space.setAttribute('aria-hidden', 'true');
      li.append(space);
    }
    const p = document.createElement('p');
    p.className = 'bubble';
    const who = document.createElement('span');
    who.className = 'visually-hidden';
    who.textContent = mine
      ? 'You: '
      : `${message.sender === 'ai' ? 'Her AI assistant' : herName}: `;
    p.append(who, message.body);
    li.append(p);
    return li;
  });
}

async function send(
  url: string,
  body: Record<string, unknown>,
): Promise<{ outcome: string; data?: Record<string, string> }> {
  try {
    const turnstile = await turnstileToken('dm');
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, turnstile }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, string>;
    return res.ok ? { outcome: 'sent', data } : { outcome: data.error ?? 'failed' };
  } catch {
    return { outcome: 'failed' };
  }
}

export function initDm(): void {
  listMine();
  const pane = document.querySelector<HTMLElement>('.dm-pane');
  const form = pane?.querySelector<HTMLFormElement>('[data-dm-form]');
  if (!pane) return;
  const list = pane.querySelector<HTMLOListElement>('[data-messages]')!;
  const status = pane.querySelector<HTMLElement>('[data-dm-status]');
  const herName = pane.querySelector('h1')?.textContent?.replace(/^Message /, '') ?? 'Bhoomi';
  const body = form?.querySelector<HTMLTextAreaElement>('textarea[name="body"]');

  // Enter sends, Shift+Enter starts a new line.
  body?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form?.requestSubmit();
    }
  });

  if (pane.dataset.mode === 'starter') {
    const topic = pane.dataset.topic!;
    const label = pane.dataset.label ?? topic;
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(form)) as Record<string, string>;
      if (!fields.name?.trim() || !fields.body?.trim()) {
        if (status) status.textContent = MESSAGES.bad_request;
        return;
      }
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      button.disabled = true;
      if (status) status.textContent = 'Sending…';
      const { outcome, data } = await send('/api/dm', { ...fields, topic });
      button.disabled = false;
      if (outcome !== 'sent' || !data) {
        if (status) status.textContent = MESSAGES[outcome] ?? MESSAGES.failed;
        return;
      }
      save({
        id: data.id,
        secret: data.secret,
        topic,
        label,
        last: fields.body.trim(),
        at: Date.now(),
      });
      location.assign(threadUrl(data.id, data.secret));
    });
    return;
  }

  // A private conversation: the key is the fragment, #<id>.<secret>. Opening another of the
  // visitor's conversations only changes the fragment, so start over.
  window.addEventListener('hashchange', () => location.reload());
  const [id, secret] = location.hash.slice(1).split('.');
  const topics = JSON.parse(pane.querySelector('[data-dm-topics]')?.textContent ?? '{}') as Record<
    string,
    { label: string; opener: string }
  >;
  const privateLink = pane.querySelector<HTMLElement>('[data-private-link]');
  const urlField = pane.querySelector<HTMLInputElement>('[data-private-url]');
  let shown = '';

  const render = (topic: string, messages: Message[]) => {
    const key = JSON.stringify(messages.map((m) => m.id));
    if (key === shown) return;
    shown = key;
    const opener = topics[topic];
    const head = opener ? [{ sender: 'bhoomi' as const, body: opener.opener }] : [];
    list.replaceChildren(...bubbles([...head, ...messages], herName));
    const label = pane.querySelector('[data-topic-label]');
    if (label && opener) label.textContent = opener.label;
    const last = messages[messages.length - 1];
    if (last) {
      save({
        id,
        secret,
        topic,
        label: opener?.label ?? topic,
        last: last.body,
        at: last.createdAt,
      });
    }
  };

  const load = async () => {
    if (!id || !secret) {
      if (status) status.textContent = MESSAGES.not_found;
      form?.setAttribute('hidden', '');
      return false;
    }
    try {
      const res = await fetch(`/api/dm/${encodeURIComponent(id)}`, {
        credentials: 'same-origin',
        headers: { 'X-Thread-Secret': secret },
      });
      if (!res.ok) {
        if (status) status.textContent = MESSAGES.not_found;
        form?.setAttribute('hidden', '');
        return false;
      }
      const { thread } = (await res.json()) as { thread: { topic: string; messages: Message[] } };
      render(thread.topic, thread.messages);
      return true;
    } catch {
      return false;
    }
  };

  void load().then((ok) => {
    if (!ok) return;
    if (privateLink && urlField) {
      urlField.value = location.href;
      privateLink.hidden = false;
    }
    listMine();
    // Her replies appear while the page is open and in view.
    setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
  });

  pane.querySelector('[data-copy-link]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      if (status) status.textContent = 'Link copied.';
    } catch {
      urlField?.select();
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = body?.value.trim();
    if (!text) return;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    const { outcome } = await send(`/api/dm/${encodeURIComponent(id)}`, { secret, body: text });
    button.disabled = false;
    if (outcome !== 'sent') {
      if (status) status.textContent = MESSAGES[outcome] ?? MESSAGES.failed;
      return;
    }
    if (status) status.textContent = '';
    body!.value = '';
    await load();
  });
}
