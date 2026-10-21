import { turnstileToken } from './turnstile';

/**
 * "Ask my AI" (task 3.2.3), on /direct/ask-ai/. A question goes to /api/ai with the conversation
 * so far; the answer streams back as server-sent events and fills an AI bubble as it arrives,
 * with the sources it used as links underneath. The conversation lives in this tab only
 * (sessionStorage): it survives following a source and coming back, and nothing is saved on the
 * site.
 */

interface Source {
  title: string;
  url: string;
}

/** One question and its answer, as shown. Only complete answers go back as context. */
interface Exchange {
  question: string;
  answer: string;
  sources: Source[];
  notice?: string;
  complete: boolean;
}

const STORE = 'bhoomi:ai-chat';
// Matches the server's limits (src/lib/server/ai.ts): nine turns, answers up to 4,000 characters.
const CONTEXT_EXCHANGES = 4;
const ANSWER_LIMIT = 4000;

const MESSAGES: Record<string, string> = {
  disabled: 'The AI assistant is off right now.',
  rate_limited: 'That was quick. Try again in a minute.',
  daily_cap: 'The AI has answered all it can for today. Try again tomorrow, or message her.',
  bad_request: 'Keep a question under 1,000 characters.',
  failed: "Couldn't get an answer. Try again.",
};

function load(): Exchange[] {
  try {
    const list = JSON.parse(sessionStorage.getItem(STORE) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function store(exchanges: Exchange[]): void {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(exchanges));
  } catch {
    // Storage blocked: the conversation lasts as long as the page.
  }
}

/** The conversation to send: the last few complete exchanges, then the new question. */
export function conversation(exchanges: Exchange[], question: string) {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const exchange of exchanges
    .filter((e) => e.complete && e.answer)
    .slice(-CONTEXT_EXCHANGES)) {
    turns.push({ role: 'user', content: exchange.question });
    turns.push({ role: 'assistant', content: exchange.answer.slice(0, ANSWER_LIMIT) });
  }
  turns.push({ role: 'user', content: question });
  return turns;
}

/** Server-sent events from a response body, one parsed event at a time. */
export async function* readEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1];
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) as Record<string, unknown> };
    }
  }
}

export function initAiChat(): void {
  const pane = document.querySelector<HTMLElement>('.dm-pane');
  const form = pane?.querySelector<HTMLFormElement>('[data-ai-form]');
  if (!pane || !form) return;
  const list = pane.querySelector<HTMLOListElement>('[data-messages]')!;
  const field = form.querySelector<HTMLTextAreaElement>('textarea')!;
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[data-ai-status]');
  const off = form.querySelector<HTMLElement>('[data-ai-off]');
  const suggestions = pane.querySelector<HTMLElement>('[data-ai-suggestions]');
  const reset = pane.querySelector<HTMLButtonElement>('[data-ai-reset]');
  const mark = pane.querySelector('[data-ai-opener] .ai-mark');

  let exchanges = load();
  let busy: AbortController | null = null;

  const say = (text: string) => {
    if (status) status.textContent = text;
  };

  // Follows the answer down the page, unless the visitor has scrolled up to read.
  // The composer lands at the bottom of the screen, above the tab bar (its scroll margin).
  const nearBottom = () => form.getBoundingClientRect().top < innerHeight + 160;
  const keepInView = (force = false) => {
    if (force || nearBottom()) form.scrollIntoView({ block: 'end' });
  };

  const question = (text: string) => {
    const li = document.createElement('li');
    li.className = 'msg from-you';
    const bubble = document.createElement('p');
    bubble.className = 'bubble';
    const who = document.createElement('span');
    who.className = 'visually-hidden';
    who.textContent = 'You: ';
    bubble.append(who, text);
    li.append(bubble);
    list.append(li);
  };

  /** An AI bubble, with its typing dots until text arrives. Returns what fills it. */
  const answer = () => {
    const li = document.createElement('li');
    li.className = 'msg from-her from-ai';
    if (mark) li.append(mark.cloneNode(true));
    const column = document.createElement('div');
    column.className = 'answer';
    const bubble = document.createElement('p');
    bubble.className = 'bubble typing';
    bubble.innerHTML = '<span></span><span></span><span></span>';
    column.append(bubble);
    li.append(column);
    list.append(li);

    let text = '';
    const sources = document.createElement('ul');
    sources.className = 'sources';
    sources.setAttribute('aria-label', 'Sources');
    return {
      text(piece: string) {
        if (!text) {
          bubble.className = 'bubble';
          bubble.replaceChildren();
          const who = document.createElement('span');
          who.className = 'visually-hidden';
          who.textContent = 'AI: ';
          bubble.append(who);
        }
        text += piece;
        bubble.append(piece);
      },
      source({ title, url }: Source) {
        if (!sources.isConnected) column.append(sources);
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = url;
        link.textContent = title;
        item.append(link);
        sources.append(item);
      },
      note(message: string) {
        if (!text) {
          // Nothing was said: the note takes the bubble's place.
          bubble.remove();
        }
        const note = document.createElement('p');
        note.className = 'ai-note';
        note.textContent = message;
        column.append(note);
      },
      remove: () => li.remove(),
      get said() {
        return text;
      },
    };
  };

  const show = (exchange: Exchange) => {
    question(exchange.question);
    const view = answer();
    if (exchange.answer) view.text(exchange.answer);
    for (const source of exchange.sources) view.source(source);
    if (exchange.notice) view.note(exchange.notice);
    if (!exchange.answer && !exchange.notice) view.remove();
  };

  const settle = () => {
    if (suggestions) suggestions.hidden = exchanges.length > 0;
    if (reset) reset.hidden = exchanges.length === 0;
  };

  const setOn = (on: boolean) => {
    if (off) off.hidden = on;
    field.disabled = !on;
    send.disabled = !on;
    if (suggestions && !on) suggestions.hidden = true;
  };

  for (const exchange of exchanges) show(exchange);
  settle();

  // Is it answering? Say so before anyone types.
  void fetch('/api/ai', { credentials: 'same-origin' })
    .then(async (res) => setOn(res.ok && ((await res.json()) as { on?: boolean }).on === true))
    .catch(() => setOn(false));

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (trimmed.length > 1000) return say(MESSAGES.bad_request);
    const messages = conversation(exchanges, trimmed);
    const exchange: Exchange = { question: trimmed, answer: '', sources: [], complete: false };
    field.value = '';
    say('');
    question(trimmed);
    const view = answer();
    if (suggestions) suggestions.hidden = true;
    keepInView(true);

    busy = new AbortController();
    send.disabled = true;
    list.setAttribute('aria-busy', 'true');
    let done = false;
    try {
      const turnstile = await turnstileToken('ai');
      const res = await fetch('/api/ai', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, turnstile }),
        signal: busy.signal,
      });
      if (!res.ok || !res.body) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        if (error === 'disabled') setOn(false);
        throw new Error(error ?? 'failed');
      }
      for await (const { event, data } of readEvents(res.body)) {
        if (event === 'text') {
          view.text(String(data.text));
          exchange.answer = view.said;
          keepInView();
        } else if (event === 'cite') {
          const source = { title: String(data.title), url: String(data.url) };
          exchange.sources.push(source);
          view.source(source);
        } else if (event === 'notice') {
          exchange.notice = String(data.message);
          view.note(exchange.notice);
        } else if (event === 'done') {
          done = true;
        } else if (event === 'error') {
          throw new Error('failed');
        }
      }
      // A stream that ends without "done" was cut off.
      if (!done) throw new Error('failed');
      exchange.complete = true;
      exchanges = [...exchanges, exchange];
      store(exchanges);
    } catch (error) {
      // Stopped by "New chat": that already cleared the page.
      if (!busy?.signal.aborted) {
        // Take the question back off the page and give it back to the visitor to try again.
        view.remove();
        list.lastElementChild?.remove();
        if (!field.value) field.value = trimmed;
        say(MESSAGES[(error as Error).message] ?? MESSAGES.failed);
      }
    } finally {
      busy = null;
      list.removeAttribute('aria-busy');
      if (!field.disabled) send.disabled = false;
      settle();
      keepInView();
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void ask(field.value);
  });

  // Enter asks, Shift+Enter starts a new line, as in her other conversations.
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  suggestions?.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-question]');
    if (button && !field.disabled) void ask(button.dataset.question!);
  });

  reset?.addEventListener('click', () => {
    busy?.abort();
    exchanges = [];
    store(exchanges);
    for (const item of [...list.children]) {
      if (!item.matches('[data-ai-opener]')) item.remove();
    }
    say('');
    settle();
    if (!field.disabled) {
      if (suggestions) suggestions.hidden = false;
      field.focus();
    }
  });
}
