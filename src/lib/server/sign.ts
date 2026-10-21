/**
 * Signed, expiring links for Bhoomi's approve and reject buttons: an HMAC-SHA256 over what the
 * link does, keyed with the APPROVAL_SECRET Worker secret. Anyone without the secret can't make
 * one, and a link stops working when it expires.
 */

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function sign(payload: string, secret: string): Promise<string> {
  return base64url(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload)));
}

/** Compares in constant time, so a wrong signature takes as long as a nearly right one. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type Decision = 'approve' | 'reject';
export const DECISION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const payloadOf = (kind: string, id: string, action: Decision, expires: number) =>
  `${kind}:${id}:${action}:${expires}`;

/** The query string for a decision link: what, which, and until when, signed. */
export async function decisionLink(
  base: string,
  kind: 'comment',
  id: string,
  action: Decision,
  secret: string,
  now: number,
): Promise<string> {
  const expires = now + DECISION_TTL_MS;
  const sig = await sign(payloadOf(kind, id, action, expires), secret);
  const url = new URL('/api/comments/decide', base);
  url.search = new URLSearchParams({ id, action, exp: String(expires), sig }).toString();
  return url.href;
}

export type LinkCheck = 'ok' | 'invalid' | 'expired';

export async function checkDecision(
  params: URLSearchParams,
  kind: 'comment',
  secret: string | undefined,
  now: number,
): Promise<{ result: LinkCheck; id?: string; action?: Decision }> {
  const id = params.get('id') ?? '';
  const action = params.get('action');
  const expires = Number(params.get('exp'));
  const sig = params.get('sig') ?? '';
  if (
    !secret ||
    !id ||
    (action !== 'approve' && action !== 'reject') ||
    !Number.isFinite(expires)
  ) {
    return { result: 'invalid' };
  }
  const expected = await sign(payloadOf(kind, id, action, expires), secret);
  if (!safeEqual(sig, expected)) return { result: 'invalid' };
  if (now > expires) return { result: 'expired' };
  return { result: 'ok', id, action };
}

/** Bhoomi's reply links for DMs: conversations are slower than comments, so 30 days. */
export const REPLY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A link that opens a DM thread for Bhoomi to read and answer. */
export async function replyLink(
  base: string,
  threadId: string,
  secret: string,
  now: number,
): Promise<string> {
  const expires = now + REPLY_TTL_MS;
  const sig = await sign(`dm:${threadId}:reply:${expires}`, secret);
  const url = new URL('/api/dm/reply', base);
  url.search = new URLSearchParams({ id: threadId, exp: String(expires), sig }).toString();
  return url.href;
}

export async function checkReply(
  params: URLSearchParams,
  secret: string | undefined,
  now: number,
): Promise<{ result: LinkCheck; id?: string }> {
  const id = params.get('id') ?? '';
  const expires = Number(params.get('exp'));
  const sig = params.get('sig') ?? '';
  if (!secret || !id || !Number.isFinite(expires)) return { result: 'invalid' };
  const expected = await sign(`dm:${id}:reply:${expires}`, secret);
  if (!safeEqual(sig, expected)) return { result: 'invalid' };
  if (now > expires) return { result: 'expired' };
  return { result: 'ok', id };
}
