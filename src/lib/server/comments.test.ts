import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { commentsApi, parseComment } from './comments';
import { FLAGS_KEY } from './flags';
import { TURNSTILE_TEST_SECRET, type Platform } from './guard';
import { notifyBhoomi, telegramMessage, type Notice } from './notify';
import { platformFrom } from './platform';
import { checkDecision, DECISION_TTL_MS, decisionLink, safeEqual, sign } from './sign';
import { localBindings, type LocalBindings } from './testing';

// Worker integration tests: comments from posting to Bhoomi's decision, on real local bindings.
let env: LocalBindings;
let dispose: () => Promise<void>;
let platform: Platform;
let notices: Notice[];
let clock: number;
const SECRET = 'approval-secret-for-tests';
const ORIGIN = 'https://bhoomi.example';
let n = 0;

const api = commentsApi({
  posts: new Set(['themobiadz', 'wearduds']),
  notify: async (notice) => {
    notices.push(notice);
    return true;
  },
  secret: SECRET,
  now: () => clock,
});

beforeAll(async () => {
  const local = await localBindings();
  env = local.env;
  dispose = local.dispose;
  platform = platformFrom({ ...env, TURNSTILE_SECRET: TURNSTILE_TEST_SECRET });
}, 120_000);

afterAll(async () => dispose?.());
beforeEach(async () => {
  notices = [];
  clock = Date.UTC(2026, 9, 22, 9);
  await env.FLAGS.put(FLAGS_KEY, '{}');
});

const post = (body: unknown) =>
  new Request(`${ORIGIN}/api/comments/x`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': `203.0.113.${++n}`,
    },
    body: JSON.stringify({ turnstile: 'token', ...(body as object) }),
  });

/** Follows one of Bhoomi's links: GET shows the page, the form's POST decides. */
async function follow(url: string) {
  const review = await api.review(new Request(url), platform);
  const decide = () =>
    api.decide(
      new Request(`${ORIGIN}/api/comments/decide`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URL(url).searchParams.toString(),
      }),
      platform,
    );
  return { review, decide };
}

describe('comments', () => {
  it('a new comment waits unseen, and Bhoomi is told with approve and reject links', async () => {
    const res = await api.create(
      post({ name: 'Asha', body: 'Lovely work!' }),
      'themobiadz',
      platform,
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, status: 'pending' });

    const listed = await (await api.list('themobiadz', platform)).json();
    expect(listed).toEqual({ ok: true, comments: [] });

    expect(notices).toHaveLength(1);
    const [notice] = notices;
    expect(notice.title).toBe('New comment on /p/themobiadz/');
    expect(notice.lines).toContain('Lovely work!');
    expect(notice.links?.map((l) => l.label)).toEqual(['Approve', 'Reject']);
    for (const link of notice.links!) {
      expect(link.url).toMatch(/^https:\/\/bhoomi\.example\/api\/comments\/decide\?id=/);
    }
  });

  it('opening the approve link only shows a button; pressing it publishes the comment', async () => {
    await api.create(post({ name: 'Ravi', body: 'Great case study' }), 'wearduds', platform);
    const approve = notices[0].links![0].url;

    const { review, decide } = await follow(approve);
    expect(review.status).toBe(200);
    const html = await review.text();
    expect(html).toContain('Approve this comment?');
    expect(html).toContain('<form method="post">');
    expect(review.headers.get('X-Robots-Tag')).toBe('noindex');
    // Still pending: the GET decided nothing.
    expect((await (await api.list('wearduds', platform)).json()).comments).toEqual([]);

    const done = await decide();
    expect(await done.text()).toContain('It’s live');
    const { comments } = await (await api.list('wearduds', platform)).json();
    expect(comments).toEqual([
      {
        id: expect.any(String),
        name: 'Ravi',
        body: 'Great case study',
        createdAt: expect.any(Number),
      },
    ]);

    // A second press, or the reject link afterwards, changes nothing.
    expect(await (await decide()).text()).toContain('Already approved');
    const reject = notices[0].links![1].url;
    expect(await (await follow(reject)).review.text()).toContain('Already approved');
  });

  it('a rejected comment is never served', async () => {
    await api.create(post({ name: 'Bot', body: 'cheap pills' }), 'themobiadz', platform);
    const reject = notices[0].links![1].url;
    expect(await (await (await follow(reject)).decide()).text()).toContain('never be shown');
    const { comments } = await (await api.list('themobiadz', platform)).json();
    expect(comments.map((c: { name: string }) => c.name)).not.toContain('Bot');
  });

  it('links expire after 7 days, and a tampered link does nothing', async () => {
    await api.create(post({ name: 'Late', body: 'Hello' }), 'wearduds', platform);
    const approve = notices[0].links![0].url;

    const tampered = approve.replace('action=approve', 'action=reject');
    expect((await api.review(new Request(tampered), platform)).status).toBe(400);
    const forged = new URL(approve);
    forged.searchParams.set('id', 'someone-elses-comment');
    expect((await api.review(new Request(forged), platform)).status).toBe(400);

    clock += DECISION_TTL_MS + 1;
    const { review, decide } = await follow(approve);
    expect(review.status).toBe(410);
    expect((await decide()).status).toBe(410);
  });

  it('the decide button only works from the page itself', async () => {
    const res = await api.decide(
      new Request(`${ORIGIN}/api/comments/decide`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: 'id=x',
      }),
      platform,
    );
    expect(res.status).toBe(403);
  });

  it('only real posts take comments, and the off switch stops both ways', async () => {
    expect((await api.list('nope', platform)).status).toBe(404);
    expect((await api.create(post({ name: 'A', body: 'B' }), 'nope', platform)).status).toBe(404);
    await env.FLAGS.put(FLAGS_KEY, '{"comments":false}');
    expect((await api.list('wearduds', platform)).status).toBe(503);
    expect((await api.create(post({ name: 'A', body: 'B' }), 'wearduds', platform)).status).toBe(
      503,
    );
    expect(notices).toEqual([]);
  });

  it('refuses empty, overlong or link-stuffed comments', async () => {
    for (const body of [
      { name: '', body: 'x' },
      { name: 'x', body: '   ' },
      { name: 'x'.repeat(41), body: 'x' },
      { name: 'x', body: 'y'.repeat(501) },
      { name: 'x', body: 'see http://a.example and https://b.example' },
    ]) {
      expect((await api.create(post(body), 'wearduds', platform)).status).toBe(400);
    }
    expect(notices).toEqual([]);
  });

  it('without an approval secret, comments wait in the database and nobody is told', async () => {
    const quiet = commentsApi({
      posts: new Set(['wearduds']),
      notify: async (notice) => (notices.push(notice), true),
      secret: undefined,
    });
    expect((await quiet.create(post({ name: 'A', body: 'Hi' }), 'wearduds', platform)).status).toBe(
      202,
    );
    expect(notices).toEqual([]);
    const link = `${ORIGIN}/api/comments/decide?id=x&action=approve&exp=9999999999999&sig=y`;
    expect((await quiet.review(new Request(link), platform)).status).toBe(400);
  });
});

describe('parseComment', () => {
  it('tidies whitespace and control characters', () => {
    expect(parseComment({ name: '  Asha \t Rao ', body: ' Hi\u0007 there\n\n\n\nBye ' })).toEqual({
      name: 'Asha Rao',
      body: 'Hi there\n\nBye',
    });
  });

  it('allows one link in the body, none in the name, and nothing that is not text', () => {
    expect(parseComment({ name: 'A', body: 'my repo: https://github.com/x' })).not.toBeNull();
    expect(parseComment({ name: 'www.spam.example', body: 'hi' })).toBeNull();
    expect(parseComment({ name: 42, body: 'hi' })).toBeNull();
  });
});

describe('signed links', () => {
  it('signs deterministically and compares safely', async () => {
    expect(await sign('a', 'k')).toBe(await sign('a', 'k'));
    expect(await sign('a', 'k')).not.toBe(await sign('a', 'other'));
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });

  it('a link checks out until it expires', async () => {
    const url = new URL(await decisionLink(ORIGIN, 'comment', 'c1', 'approve', SECRET, 1000));
    expect(await checkDecision(url.searchParams, 'comment', SECRET, 1000)).toEqual({
      result: 'ok',
      id: 'c1',
      action: 'approve',
    });
    expect(
      (await checkDecision(url.searchParams, 'comment', SECRET, 1000 + DECISION_TTL_MS + 1)).result,
    ).toBe('expired');
    expect((await checkDecision(url.searchParams, 'comment', 'wrong', 1000)).result).toBe(
      'invalid',
    );
    expect((await checkDecision(url.searchParams, 'comment', undefined, 1000)).result).toBe(
      'invalid',
    );
    url.searchParams.set('action', 'publish');
    expect((await checkDecision(url.searchParams, 'comment', SECRET, 1000)).result).toBe('invalid');
  });
});

describe('notifyBhoomi', () => {
  const notice: Notice = {
    title: 'New comment on /p/x/',
    lines: ['<script>alert(1)</script> & co'],
    links: [{ label: 'Approve', url: 'https://bhoomi.example/a' }],
  };

  it('sends a Telegram message with buttons, escaping what visitors typed', async () => {
    const fetch = vi.fn(async () => new Response('{}'));
    expect(
      await notifyBhoomi(notice, { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42' }, fetch),
    ).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botT/sendMessage');
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe('42');
    expect(body.text).toBe(
      '<b>New comment on /p/x/</b>\n&lt;script&gt;alert(1)&lt;/script&gt; &amp; co',
    );
    expect(body.reply_markup).toEqual({
      inline_keyboard: [[{ text: 'Approve', url: 'https://bhoomi.example/a' }]],
    });
  });

  it('also posts the notice as JSON to a webhook, and either channel is enough', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes('telegram') ? new Response('down', { status: 502 }) : new Response('ok'),
    );
    const sent = await notifyBhoomi(
      notice,
      {
        TELEGRAM_BOT_TOKEN: 'T',
        TELEGRAM_CHAT_ID: '1',
        NOTIFY_WEBHOOK_URL: 'https://hooks.example/n',
      },
      fetch as unknown as typeof globalThis.fetch,
    );
    expect(sent).toBe(true);
    const hook = fetch.mock.calls.find(([url]) => url === 'https://hooks.example/n')!;
    expect(JSON.parse(String((hook as unknown as [string, RequestInit])[1].body))).toEqual(notice);
  });

  it('does nothing without a channel, and never throws', async () => {
    const fetch = vi.fn(async () => new Response('{}'));
    expect(await notifyBhoomi(notice, {}, fetch)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    const down = vi.fn(async () => Promise.reject(new Error('offline')));
    expect(
      await notifyBhoomi(notice, { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1' }, down),
    ).toBe(false);
    const refused = vi.fn(async () => new Response('no', { status: 401 }));
    expect(
      await notifyBhoomi(notice, { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1' }, refused),
    ).toBe(false);
    expect(telegramMessage({ title: 't', lines: [] }).reply_markup).toBeUndefined();
  });
});
