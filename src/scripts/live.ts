import { activeLabel, parseServer } from '../lib/server/presence-core';
import { turnstileToken } from './turnstile';

/**
 * The live layer (task 3.2.2), on every page:
 *
 * - One WebSocket to the live room (/api/live). Its visitor count lights "Active now" on her
 *   avatar, and poll results arrive as others vote.
 * - The story's interactive stickers: a poll (results after you vote, updating live), a question
 *   box (answers go to Bhoomi only), an emoji slider (the average after you slide).
 *
 * Everything degrades: with the switches off, or no WebSockets, there's no "Active now" and polls
 * show results only after your own vote; a refused answer says so and changes nothing.
 */

const VOTES = 'bhoomi:votes';
const RETRIES = 4;

const results = new Map<string, Record<string, number>>();

function myVotes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(VOTES) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function remember(id: string, value: number): void {
  try {
    localStorage.setItem(VOTES, JSON.stringify({ ...myVotes(), [id]: value }));
  } catch {
    // Storage blocked: the vote still counted.
  }
}

const MESSAGES: Record<string, string> = {
  disabled: 'Answers are off for now.',
  rate_limited: 'That was quick. Try again in a minute.',
  failed: "Couldn't send it. Try again.",
};

async function answer(id: string, body: Record<string, unknown>) {
  try {
    const turnstile = await turnstileToken('answer');
    const res = await fetch(`/api/polls/${encodeURIComponent(id)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, turnstile }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      mine?: number;
      results?: Record<string, number>;
    };
    return res.ok ? { ok: true as const, ...data } : { ok: false as const, error: data.error };
  } catch {
    return { ok: false as const, error: 'failed' };
  }
}

/** A poll with its results: bars and percentages, the visitor's own choice marked. */
function showPoll(el: HTMLElement, counts: Record<string, number>, mine: number | undefined) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  el.classList.add('voted');
  for (const option of el.querySelectorAll<HTMLButtonElement>('.poll-option')) {
    const n = counts[option.dataset.choice ?? ''] ?? 0;
    const pct = total ? Math.round((n / total) * 100) : 0;
    option.style.setProperty('--pct', `${pct}%`);
    option.querySelector('.poll-pct')!.textContent = `${pct}%`;
    const isMine = Number(option.dataset.choice) === mine;
    option.classList.toggle('mine', isMine);
    option.setAttribute('aria-pressed', String(isMine));
  }
  const status = el.querySelector('.live-status');
  if (status) status.textContent = `${total} ${total === 1 ? 'vote' : 'votes'}`;
}

/** Brings a poll or slider that just appeared (a story frame is cloned on demand) up to date. */
function hydrate(el: HTMLElement): void {
  if (el.dataset.hydrated) return;
  el.dataset.hydrated = '';
  const id = el.dataset.poll ?? el.dataset.slider;
  if (!id) return;
  const mine = myVotes()[id];
  if (mine === undefined) return;
  if (el.dataset.slider) {
    el.querySelector<HTMLInputElement>('input[type="range"]')!.value = String(mine);
  }
  const cached = results.get(id);
  if (cached && el.dataset.poll) return showPoll(el, cached, mine);
  void fetch(`/api/polls/${encodeURIComponent(id)}`, { credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) return;
      const { results: counts } = (await res.json()) as { results: Record<string, number> };
      if (el.dataset.poll) {
        results.set(id, counts);
        showPoll(el, counts, mine);
      } else {
        const status = el.querySelector('.live-status');
        if (status) status.textContent = `Average ${counts.average} · ${counts.count} answered`;
      }
    })
    .catch(() => {});
}

function connect(attempt = 0): void {
  if (!('WebSocket' in window)) return;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live`;
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    return;
  }
  let opened = false;
  socket.addEventListener('open', () => {
    opened = true;
  });
  socket.addEventListener('message', (event) => {
    const message = parseServer(event.data);
    if (!message) return;
    if (message.type === 'count') {
      for (const el of document.querySelectorAll<HTMLElement>('[data-active-now]')) {
        const label = el.querySelector('[data-active-label]');
        if (label) label.textContent = activeLabel(message.count);
        el.hidden = false;
      }
      return;
    }
    results.set(message.poll, message.results);
    for (const el of document.querySelectorAll<HTMLElement>(
      `[data-poll="${CSS.escape(message.poll)}"].voted`,
    )) {
      showPoll(el, message.results, myVotes()[message.poll]);
    }
  });
  socket.addEventListener('close', () => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-active-now]')) el.hidden = true;
    // Refused (switched off) or never opened: stay static. A dropped room gets a few retries.
    if (!opened || attempt >= RETRIES) return;
    setTimeout(() => connect(attempt + 1), 2000 * 2 ** attempt);
  });
}

export function initLive(): void {
  connect();

  // Stickers appear when a story frame is rendered; bring each up to date as it does.
  const scan = (root: ParentNode) =>
    root.querySelectorAll<HTMLElement>('[data-poll], [data-slider]').forEach(hydrate);
  scan(document);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof Element) scan(node);
    }
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', async (event) => {
    const option = (event.target as Element).closest<HTMLButtonElement>('.poll-option');
    const poll = option?.closest<HTMLElement>('[data-poll]');
    if (!option || !poll) return;
    const id = poll.dataset.poll!;
    const choice = Number(option.dataset.choice);
    if (myVotes()[id] === choice && poll.classList.contains('voted')) return;
    const status = poll.querySelector('.live-status');
    if (status) status.textContent = 'Sending…';
    const result = await answer(id, { choice });
    if (!result.ok || !result.results) {
      if (status) status.textContent = MESSAGES[result.error ?? 'failed'] ?? MESSAGES.failed;
      return;
    }
    remember(id, choice);
    results.set(id, result.results);
    showPoll(poll, result.results, choice);
  });

  document.addEventListener('submit', async (event) => {
    const form = (event.target as Element).closest<HTMLFormElement>('[data-question]');
    if (!form) return;
    event.preventDefault();
    const field = form.querySelector('textarea')!;
    const status = form.querySelector('.live-status');
    const body = field.value.trim();
    if (!body) return;
    if (status) status.textContent = 'Sending…';
    const result = await answer(form.dataset.question!, { body });
    if (!result.ok) {
      if (status) status.textContent = MESSAGES[result.error ?? 'failed'] ?? MESSAGES.failed;
      return;
    }
    field.value = '';
    if (status) status.textContent = 'Sent to Bhoomi. Only she sees answers.';
  });

  // A slider sends when it's let go (or after a pause in keyboard changes).
  let pause: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const slider = input.closest<HTMLElement>('[data-slider]');
    if (!slider || input.type !== 'range') return;
    clearTimeout(pause);
    pause = setTimeout(async () => {
      const id = slider.dataset.slider!;
      const value = Number(input.value);
      const status = slider.querySelector('.live-status');
      const result = await answer(id, { value });
      if (!result.ok || !result.results) {
        if (status) status.textContent = MESSAGES[result.error ?? 'failed'] ?? MESSAGES.failed;
        return;
      }
      remember(id, value);
      if (status) {
        status.textContent = `Average ${result.results.average} · ${result.results.count} answered`;
      }
    }, 400);
  });
}
