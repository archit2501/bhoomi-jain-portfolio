/**
 * Comments, held for Bhoomi's approval.
 *
 *   GET  /api/comments/<post>     approved comments only, oldest first. Nothing else is served.
 *   POST /api/comments/<post>     a new comment (full write pipeline), stored as pending, and a
 *                                 notice to Bhoomi with signed approve and reject links.
 *   GET  /api/comments/decide     what a link opens: the comment and one button. Link scanners
 *                                 follow GETs, so a GET never decides anything.
 *   POST /api/comments/decide     the button: checks the signature and expiry, then decides.
 */
import { readFlags } from './flags';
import { defineWrite, errorResponse, sameSite, type Platform } from './guard';
import type { Notice } from './notify';
import { checkDecision, decisionLink, type Decision } from './sign';

export const LIMITS = { name: 40, body: 500, links: 1 } as const;

export interface CommentsDeps {
  /** The posts that take comments (their slugs). */
  posts: ReadonlySet<string>;
  notify: (notice: Notice) => Promise<boolean>;
  /** APPROVAL_SECRET: signs Bhoomi's links. Without it, comments wait unseen in the database. */
  secret: string | undefined;
  now?: () => number;
}

// Control characters (except newlines and tabs) never belong in a comment.
// eslint-disable-next-line no-control-regex -- matching them is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (value: unknown) =>
  typeof value === 'string' ? value.replace(CONTROL, '').trim() : '';

/** Validates a new comment: a short name and a short body with at most one link. */
export function parseComment(body: Record<string, unknown>): { name: string; body: string } | null {
  const name = clean(body.name).replace(/\s+/g, ' ');
  const text = clean(body.body).replace(/\n{3,}/g, '\n\n');
  if (!name || name.length > LIMITS.name || !text || text.length > LIMITS.body) return null;
  if ((text.match(/https?:\/\/|www\./gi) ?? []).length > LIMITS.links) return null;
  if (/https?:\/\/|www\./i.test(name)) return null;
  return { name, body: text };
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A small standalone page for Bhoomi's links: no scripts, nothing cached, not indexed. */
export function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escape(title)}</title>
<style>body{font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#0c1014;background:#fff}
blockquote{margin:1rem 0;padding:.75rem 1rem;background:#f3f5f7;border-radius:12px;white-space:pre-wrap}
button{font:inherit;font-weight:600;padding:.6rem 1.2rem;border:0;border-radius:8px;color:#fff;background:#0369a1;cursor:pointer}
button.reject{background:#676e77}a{color:#0369a1}</style></head>
<body><h1>${escape(title)}</h1>${body}</body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      // Keeps the signed link from leaking to other sites. Not no-referrer: under that policy a
      // form POST carries Origin: null, and the decide button would fail its same-site check.
      'Referrer-Policy': 'same-origin',
    },
  });
}

const verb = (action: Decision) => (action === 'approve' ? 'Approve' : 'Reject');

export function commentsApi(deps: CommentsDeps) {
  const now = () => (deps.now ?? Date.now)();
  const known = (post: string | undefined): post is string =>
    typeof post === 'string' && deps.posts.has(post);

  const create = (post: string, origin: string) =>
    defineWrite({
      flag: 'comments',
      kind: 'comment',
      parse: parseComment,
      run: async (input, { visitor, repo }) => {
        const id = await repo.comments.create({ post, visitor, ...input });
        if (deps.secret) {
          const [approve, reject] = await Promise.all(
            (['approve', 'reject'] as const).map((action) =>
              decisionLink(origin, 'comment', id, action, deps.secret!, now()),
            ),
          );
          await deps.notify({
            title: `New comment on /p/${post}/`,
            lines: [`${input.name}:`, input.body, '', 'Links expire in 7 days.'],
            links: [
              { label: 'Approve', url: approve },
              { label: 'Reject', url: reject },
            ],
          });
        }
        return Response.json({ ok: true, status: 'pending' }, { status: 202 });
      },
    });

  return {
    async list(post: string | undefined, platform: Platform): Promise<Response> {
      if (!known(post)) return errorResponse('not_found', 404);
      if (!(await readFlags(platform.flags)).comments) return errorResponse('disabled', 503);
      const comments = await platform.repo.comments.approved(post);
      return Response.json(
        {
          ok: true,
          comments: comments.map(({ id, name, body, createdAt }) => ({
            id,
            name,
            body,
            createdAt,
          })),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    },

    async create(request: Request, post: string | undefined, platform: Platform) {
      if (!known(post)) return errorResponse('not_found', 404);
      return create(post, new URL(request.url).origin)(request, platform);
    },

    /** The page a link opens. */
    async review(request: Request, platform: Platform): Promise<Response> {
      const params = new URL(request.url).searchParams;
      const check = await checkDecision(params, 'comment', deps.secret, now());
      if (check.result === 'expired') {
        return page('This link has expired', '<p>Links work for 7 days.</p>', 410);
      }
      if (check.result !== 'ok')
        return page('This link doesn’t work', '<p>It may be incomplete.</p>', 400);
      const comment = await platform.repo.comments.get(check.id!);
      if (!comment) return page('Comment not found', '<p>It may have been removed.</p>', 404);
      if (comment.status !== 'pending') {
        return page(`Already ${comment.status}`, `<p>Nothing to do.</p>`);
      }
      const action = check.action!;
      return page(
        `${verb(action)} this comment?`,
        `<p>On <a href="/p/${escape(comment.post)}/">/p/${escape(comment.post)}/</a>, from <strong>${escape(comment.name)}</strong>:</p>
<blockquote>${escape(comment.body)}</blockquote>
<form method="post"><input type="hidden" name="id" value="${escape(check.id!)}"><input type="hidden" name="action" value="${action}">
<input type="hidden" name="exp" value="${escape(params.get('exp')!)}"><input type="hidden" name="sig" value="${escape(params.get('sig')!)}">
<button type="submit"${action === 'reject' ? ' class="reject"' : ''}>${verb(action)}</button></form>`,
      );
    },

    /** The button on that page. */
    async decide(request: Request, platform: Platform): Promise<Response> {
      if (!sameSite(request)) return errorResponse('cross_site', 403);
      let params: URLSearchParams;
      try {
        params = new URLSearchParams(await request.text());
      } catch {
        return page('This link doesn’t work', '<p>It may be incomplete.</p>', 400);
      }
      const check = await checkDecision(params, 'comment', deps.secret, now());
      if (check.result === 'expired') {
        return page('This link has expired', '<p>Links work for 7 days.</p>', 410);
      }
      if (check.result !== 'ok')
        return page('This link doesn’t work', '<p>It may be incomplete.</p>', 400);
      const comment = await platform.repo.comments.get(check.id!);
      if (!comment) return page('Comment not found', '<p>It may have been removed.</p>', 404);
      const status = check.action === 'approve' ? 'approved' : 'rejected';
      const changed = await platform.repo.comments.decide(check.id!, status);
      if (!changed) return page(`Already ${comment.status}`, '<p>Nothing changed.</p>');
      return page(
        status === 'approved' ? 'Approved' : 'Rejected',
        status === 'approved'
          ? `<p>It’s live on <a href="/p/${escape(comment.post)}/">/p/${escape(comment.post)}/</a>.</p>`
          : '<p>It will never be shown.</p>',
      );
    },
  };
}
