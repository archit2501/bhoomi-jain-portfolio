/**
 * Cloudflare Turnstile, loaded only when someone first writes (a like, a comment, a message), so
 * no page pays for it up front. Each write gets a fresh single-use token. The widget only shows
 * when Cloudflare wants an interaction; then it appears at the bottom of the screen.
 *
 * The site key comes from PUBLIC_TURNSTILE_SITE_KEY at build time. Without one, Cloudflare's
 * invisible always-pass test key is used, which only a test secret on the server accepts.
 */
interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      appearance?: 'always' | 'execute' | 'interaction-only';
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'timeout-callback'?: () => void;
      'expired-callback'?: () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TEST_SITE_KEY = '1x00000000000000000000BB';
const SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || TEST_SITE_KEY;
const TIMEOUT_MS = 30_000;

let loading: Promise<TurnstileApi> | undefined;

function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'));
    script.onerror = () => {
      loading = undefined;
      reject(new Error('turnstile'));
    };
    document.head.append(script);
  });
  return loading;
}

/** A fresh token for one write. Rejects if Turnstile can't load or the check fails. */
export async function turnstileToken(action: string): Promise<string> {
  const api = await load();
  return new Promise<string>((resolve, reject) => {
    const box = document.createElement('div');
    box.className = 'turnstile-box';
    Object.assign(box.style, {
      position: 'fixed',
      left: '50%',
      bottom: 'calc(var(--bottom-bar-h, 0px) + 16px)',
      transform: 'translateX(-50%)',
      zIndex: '200',
    });
    document.body.append(box);
    let id = '';
    const done = (error?: Error, token?: string) => {
      clearTimeout(timer);
      if (id) api.remove(id);
      box.remove();
      if (error) reject(error);
      else resolve(token!);
    };
    const timer = setTimeout(() => done(new Error('turnstile timeout')), TIMEOUT_MS);
    id = api.render(box, {
      sitekey: SITE_KEY,
      action,
      appearance: 'interaction-only',
      callback: (token) => done(undefined, token),
      'error-callback': () => done(new Error('turnstile')),
      'timeout-callback': () => done(new Error('turnstile timeout')),
      'expired-callback': () => done(new Error('turnstile expired')),
    });
  });
}
