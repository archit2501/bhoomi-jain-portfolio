/**
 * POST /api/ai: "Ask Bhoomi's AI" (task 3.2.3). The visitor's conversation goes to Claude with
 * her résumé and posts as citable documents; the reply streams back as server-sent events:
 *
 *   event: text     {"text":"…"}                       a piece of the answer
 *   event: cite     {"title":"SmartBlog AI","url":"/p/smartblog-ai/"}   a source it used
 *   event: done     {}                                    the answer is complete
 *   event: notice   {"message":"…"}                       it couldn't answer (refused, too long)
 *   event: error    {"message":"…"}                       something failed mid-answer
 *
 * Model: Claude Haiku 5.5 (`claude-haiku-5-5`), the Haiku-class first choice in the plan, at
 * `low` effort as the reference advises for chat; adaptive thinking is its default. Pricing as
 * confirmed from the claude-api reference (cached 2026-10-06): $0.10 input / $0.50 output per
 * million tokens for prompts up to 100K tokens; cache reads 0.1x input, 5-minute writes 1.25x.
 * The system prompt and the documents are the same bytes on every request and carry
 * cache_control, so most of each request is a cache read. Haiku 5.5 has no server-side refusal
 * fallback; a refusal ends with a friendly notice.
 *
 *   GET /api/ai   {"ok":true,"on":true}   whether it's answering (an API key is set, the switch is on)
 *
 * Full write pipeline (guard.ts): the `ai_chat` switch, origin, Turnstile, rate limits and a
 * daily cap. Conversations aren't stored.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AiDocument } from './ai-context';
import { readFlags } from './flags';
import { defineWrite, errorResponse, type Platform } from './guard';

export const AI_MODEL = 'claude-haiku-5-5';
export const AI_LIMITS = { turns: 9, question: 1000, answer: 4000, maxTokens: 2048 } as const;

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiDeps {
  documents: AiDocument[];
  system: string;
  /** Null when no API key is set: the assistant is then switched off. */
  client: Pick<Anthropic, 'messages'> | null;
}

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** A conversation: alternating turns, starting and ending with the visitor, kept short. */
export function parseConversation(fields: Record<string, unknown>): Turn[] | null {
  const raw = fields.messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > AI_LIMITS.turns) return null;
  const turns: Turn[] = [];
  for (const [i, item] of raw.entries()) {
    if (!item || typeof item !== 'object') return null;
    const { role, content } = item as Record<string, unknown>;
    const expected = i % 2 === 0 ? 'user' : 'assistant';
    if (role !== expected || typeof content !== 'string') return null;
    const text = content.replace(CONTROL, '').trim();
    const limit = role === 'user' ? AI_LIMITS.question : AI_LIMITS.answer;
    if (!text || text.length > limit) return null;
    turns.push({ role: expected, content: text });
  }
  return turns[turns.length - 1].role === 'user' ? turns : null;
}

/** The request: cached rules, then the documents (cached) ahead of the first question. */
export function buildRequest(
  deps: Pick<AiDeps, 'documents' | 'system'>,
  turns: Turn[],
): Anthropic.MessageCreateParamsNonStreaming {
  const documents: Anthropic.DocumentBlockParam[] = deps.documents.map((doc, i) => ({
    type: 'document',
    source: { type: 'text', media_type: 'text/plain', data: doc.text },
    title: doc.title,
    context: `On the site at ${doc.url}`,
    citations: { enabled: true },
    ...(i === deps.documents.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }));
  const [first, ...rest] = turns;
  return {
    model: AI_MODEL,
    max_tokens: AI_LIMITS.maxTokens,
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: deps.system, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: [...documents, { type: 'text', text: first.content }] },
      ...rest.map((turn) => ({ role: turn.role, content: turn.content })),
    ],
  };
}

const encoder = new TextEncoder();
const sse = (event: string, data: unknown) =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const NOTICES = {
  refusal: "I can't help with that one. Ask me about Bhoomi's projects, experience or skills.",
  max_tokens: 'That answer ran long, so it stops here. Try a narrower question.',
  error: 'Something went wrong while answering. Try again in a moment.',
} as const;

/**
 * Claude's stream, translated to the page's events, with each cited source sent once. A visitor
 * who leaves mid-answer cancels the response, which aborts the call: no paying for unread tokens.
 */
export function streamAnswer(
  client: Pick<Anthropic, 'messages'>,
  request: Anthropic.MessageCreateParamsNonStreaming,
  documents: AiDocument[],
): ReadableStream<Uint8Array> {
  let upstream: ReturnType<Anthropic['messages']['stream']> | undefined;
  let open = true;
  return new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (open) controller.enqueue(sse(event, data));
      };
      const cited = new Set<number>();
      try {
        upstream = client.messages.stream(request);
        for await (const event of upstream) {
          if (event.type !== 'content_block_delta') continue;
          if (event.delta.type === 'text_delta') {
            send('text', { text: event.delta.text });
          } else if (event.delta.type === 'citations_delta') {
            const citation = event.delta.citation;
            const index = 'document_index' in citation ? citation.document_index : -1;
            const doc = documents[index];
            if (doc && !cited.has(index)) {
              cited.add(index);
              send('cite', { title: doc.title, url: doc.url });
            }
          }
        }
        const final = await upstream.finalMessage();
        if (final.stop_reason === 'refusal') {
          send('notice', { message: NOTICES.refusal });
        } else if (final.stop_reason === 'max_tokens') {
          send('notice', { message: NOTICES.max_tokens });
        }
        send('done', {});
      } catch {
        send('error', { message: NOTICES.error });
      }
      if (open) controller.close();
      open = false;
    },
    cancel() {
      open = false;
      upstream?.abort();
    },
  });
}

export function aiApi(deps: AiDeps) {
  const ask = defineWrite({
    flag: 'ai_chat',
    kind: 'ai',
    parse: parseConversation,
    run: async (turns) => {
      const request = buildRequest(deps, turns);
      return new Response(streamAnswer(deps.client!, request, deps.documents), {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' },
      });
    },
  });

  return {
    /** Whether it's answering, so the page can say so before anyone types. */
    async get(platform: Platform): Promise<Response> {
      const on = deps.client !== null && (await readFlags(platform.flags)).ai_chat;
      return Response.json({ ok: true, on }, { headers: { 'Cache-Control': 'no-store' } });
    },

    async post(request: Request, platform: Platform): Promise<Response> {
      if (!deps.client) return errorResponse('disabled', 503);
      return ask(request, platform);
    },
  };
}
