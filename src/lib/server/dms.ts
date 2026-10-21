/**
 * Messages to Bhoomi (the DM inbox at /direct/).
 *
 *   POST /api/dm              start a conversation on one of her topics (full write pipeline);
 *                             answers with the thread id and its secret, the visitor's private key.
 *   GET  /api/dm/<id>         the conversation, for whoever holds the secret (X-Thread-Secret).
 *   POST /api/dm/<id>         the visitor writes again (secret in the body).
 *   GET  /api/dm/reply        Bhoomi's signed link: the conversation and a reply box.
 *   POST /api/dm/reply        her reply, which the visitor sees on their private link.
 *
 * Every new visitor message reaches her by Telegram and/or webhook (notify.ts), with that link.
 */
import { page } from './comments';
import { defineWrite, errorResponse, sameSite, type Platform } from './guard';
import type { Notice } from './notify';
import { checkReply, replyLink } from './sign';

export const DM_LIMITS = { name: 60, email: 120, body: 2000 } as const;

export interface Topic {
  label: string;
  /** The "Ask my AI" thread is answered by the assistant (task 3.2.3), not by Bhoomi. */
  ai: boolean;
}

export interface DmDeps {
  topics: ReadonlyMap<string, Topic>;
  notify: (notice: Notice) => Promise<boolean>;
  /** APPROVAL_SECRET: signs her reply links. Without it, messages wait in the database. */
  secret: string | undefined;
  now?: () => number;
}

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (value: unknown) =>
  typeof value === 'string' ? value.replace(CONTROL, '').trim() : '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseBody(value: unknown): string | null {
  const body = clean(value).replace(/\n{3,}/g, '\n\n');
  return body && body.length <= DM_LIMITS.body ? body : null;
}

/** A first message: a known human topic, a name, an optional email for her reply, the message. */
export function parseStart(
  fields: Record<string, unknown>,
  topics: ReadonlyMap<string, Topic>,
): { topic: string; name: string; email: string | null; body: string } | null {
  const topic = clean(fields.topic);
  const meta = topics.get(topic);
  if (!meta || meta.ai) return null;
  const name = clean(fields.name).replace(/\s+/g, ' ');
  if (!name || name.length > DM_LIMITS.name) return null;
  const email = clean(fields.email);
  if (email && (email.length > DM_LIMITS.email || !EMAIL.test(email))) return null;
  const body = parseBody(fields.body);
  if (!body) return null;
  return { topic, name, email: email || null, body };
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SECRET_HEADER = 'X-Thread-Secret';

export function dmApi(deps: DmDeps) {
  const now = () => (deps.now ?? Date.now)();
  const label = (topic: string) => deps.topics.get(topic)?.label ?? topic;

  const tell = async (origin: string, threadId: string, title: string, lines: string[]) => {
    if (!deps.secret) return;
    await deps.notify({
      title,
      lines: [...lines, '', 'The reply link works for 30 days.'],
      links: [
        { label: 'Read and reply', url: await replyLink(origin, threadId, deps.secret, now()) },
      ],
    });
  };

  const start = (origin: string) =>
    defineWrite({
      flag: 'dms',
      kind: 'dm',
      parse: (fields) => parseStart(fields, deps.topics),
      run: async (input, { visitor, repo }) => {
        const { id, secret } = await repo.dms.start({ ...input, visitor });
        await tell(origin, id, `New message: ${label(input.topic)}`, [
          `From ${input.name}${input.email ? ` <${input.email}>` : ''}:`,
          input.body,
        ]);
        return Response.json({ ok: true, id, secret }, { status: 201 });
      },
    });

  const follow = (origin: string, threadId: string) =>
    defineWrite({
      flag: 'dms',
      kind: 'dm',
      parse: (fields) => {
        const body = parseBody(fields.body);
        const secret = clean(fields.secret);
        return body && secret ? { body, secret } : null;
      },
      run: async (input, { repo }) => {
        const thread = await repo.dms.open(threadId, input.secret);
        if (!thread) return errorResponse('not_found', 404);
        await repo.dms.reply(threadId, 'visitor', input.body);
        await tell(origin, threadId, `New message: ${label(thread.topic)}`, [
          `From ${thread.name}:`,
          input.body,
        ]);
        return Response.json({ ok: true }, { status: 201 });
      },
    });

  return {
    start: (request: Request, platform: Platform) =>
      start(new URL(request.url).origin)(request, platform),

    follow: (request: Request, id: string | undefined, platform: Platform) =>
      id
        ? follow(new URL(request.url).origin, id)(request, platform)
        : errorResponse('not_found', 404),

    /** The conversation, for the secret's holder only; any mismatch is a plain 404. */
    async read(request: Request, id: string | undefined, platform: Platform): Promise<Response> {
      const secret = request.headers.get(SECRET_HEADER) ?? '';
      const thread = id && secret ? await platform.repo.dms.open(id, secret) : null;
      if (!thread) return errorResponse('not_found', 404);
      return Response.json(
        {
          ok: true,
          thread: {
            topic: thread.topic,
            label: label(thread.topic),
            messages: thread.messages.map(({ id: mid, sender, body, createdAt }) => ({
              id: mid,
              sender,
              body,
              createdAt,
            })),
          },
        },
        { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
      );
    },

    /** What her link opens: the whole conversation and a reply box. */
    async review(request: Request, platform: Platform): Promise<Response> {
      const params = new URL(request.url).searchParams;
      const check = await checkReply(params, deps.secret, now());
      if (check.result === 'expired') {
        return page('This link has expired', '<p>Reply links work for 30 days.</p>', 410);
      }
      if (check.result !== 'ok')
        return page('This link doesn’t work', '<p>It may be incomplete.</p>', 400);
      const thread = await platform.repo.dms.read(check.id!);
      if (!thread) return page('Conversation not found', '<p>It may have been removed.</p>', 404);
      const bubbles = thread.messages
        .map(
          (m) =>
            `<p><strong>${m.sender === 'bhoomi' ? 'You' : escape(thread.name)}:</strong></p><blockquote>${escape(m.body)}</blockquote>`,
        )
        .join('');
      const email = thread.email
        ? `<p>Their email: <a href="mailto:${escape(thread.email)}">${escape(thread.email)}</a></p>`
        : '<p>They left no email; they see your reply on their private link.</p>';
      return page(
        `${label(thread.topic)}: ${thread.name}`,
        `${email}${bubbles}
<form method="post"><input type="hidden" name="id" value="${escape(check.id!)}">
<input type="hidden" name="exp" value="${escape(params.get('exp')!)}"><input type="hidden" name="sig" value="${escape(params.get('sig')!)}">
<p><label for="reply">Your reply</label></p>
<textarea id="reply" name="body" rows="5" maxlength="${DM_LIMITS.body}" required style="width:100%;font:inherit"></textarea>
<p><button type="submit">Send reply</button></p></form>`,
      );
    },

    /** Her reply. */
    async reply(request: Request, platform: Platform): Promise<Response> {
      if (!sameSite(request)) return errorResponse('cross_site', 403);
      const params = new URLSearchParams(await request.text());
      const check = await checkReply(params, deps.secret, now());
      if (check.result === 'expired') {
        return page('This link has expired', '<p>Reply links work for 30 days.</p>', 410);
      }
      if (check.result !== 'ok')
        return page('This link doesn’t work', '<p>It may be incomplete.</p>', 400);
      const body = parseBody(params.get('body'));
      if (!body) return page('Nothing to send', '<p>Write a reply first.</p>', 400);
      const thread = await platform.repo.dms.read(check.id!);
      if (!thread) return page('Conversation not found', '<p>It may have been removed.</p>', 404);
      await platform.repo.dms.reply(check.id!, 'bhoomi', body);
      return page(
        'Reply sent',
        `<p>${escape(thread.name)} sees it on their private link${thread.email ? '; you can also email them' : ''}.</p>`,
      );
    },
  };
}
