/**
 * Tells Bhoomi something needs her: a new comment to approve, a new DM. Two channels, either or
 * both, each set with `wrangler secret put`:
 *
 * - Telegram: a bot she owns messages her (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).
 * - A webhook (NOTIFY_WEBHOOK_URL): the notice as JSON, to any service that takes a POST, for
 *   example an automation that emails her. The end-to-end tests point it at a local inbox.
 *
 * With no channel configured nothing is sent, and the item waits in the database.
 */

export interface NotifyConfig {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  NOTIFY_WEBHOOK_URL?: string;
}

export interface Notice {
  title: string;
  lines: string[];
  /** Buttons under the message: label and absolute URL. */
  links?: { label: string; url: string }[];
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The Telegram message: HTML parse mode, with everything a visitor typed escaped. */
export function telegramMessage(notice: Notice) {
  return {
    text: [`<b>${escape(notice.title)}</b>`, ...notice.lines.map(escape)].join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: notice.links?.length
      ? { inline_keyboard: [notice.links.map((l) => ({ text: l.label, url: l.url }))] }
      : undefined,
  };
}

async function post(fetchImpl: typeof fetch, url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * True when at least one channel took the notice. Never throws: a failed notice must not lose the
 * item, which is already saved.
 */
export async function notifyBhoomi(
  notice: Notice,
  config: NotifyConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const sends: Promise<boolean>[] = [];
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    sends.push(
      post(fetchImpl, `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: config.TELEGRAM_CHAT_ID,
        ...telegramMessage(notice),
      }),
    );
  }
  if (config.NOTIFY_WEBHOOK_URL) sends.push(post(fetchImpl, config.NOTIFY_WEBHOOK_URL, notice));
  return (await Promise.all(sends)).some(Boolean);
}
