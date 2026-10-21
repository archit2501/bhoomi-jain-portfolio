/**
 * The interactive story stickers (task 3.2.2), one endpoint for all three:
 *
 *   GET  /api/polls/<id>   a poll's counts per option, or a slider's average; a question box has
 *                          no public results (answers are for Bhoomi only).
 *   POST /api/polls/<id>   {choice} for a poll, {value: 0-100} for a slider, {body} for a question.
 *                          Votes can change; each visitor counts once. After a poll vote the new
 *                          results go to the live room, so every open copy updates.
 */
import { readFlags } from './flags';
import { defineWrite, errorResponse, type Platform } from './guard';
import type { Notice } from './notify';
import { parseBody } from './dms';

export type LiveKind = 'poll' | 'slider' | 'question';

export interface LiveSticker {
  kind: LiveKind;
  /** Options, for a poll. */
  options?: number;
  /** What it asks, for Bhoomi's notice. */
  prompt: string;
}

export interface PollsDeps {
  stickers: ReadonlyMap<string, LiveSticker>;
  /** Sends results to every open page (the Presence Durable Object). */
  broadcast: (poll: string, results: Record<string, number>) => Promise<void>;
  notify: (notice: Notice) => Promise<boolean>;
}

export function pollsApi(deps: PollsDeps) {
  const results = async (id: string, sticker: LiveSticker, platform: Platform) => {
    if (sticker.kind === 'slider') {
      const { average, count } = await platform.repo.polls.average(id);
      return { average, count };
    }
    const counts = await platform.repo.polls.results(id);
    return Object.fromEntries(
      Array.from({ length: sticker.options ?? 0 }, (_, i) => [String(i), counts[String(i)] ?? 0]),
    );
  };

  const vote = (id: string, sticker: LiveSticker) =>
    defineWrite({
      flag: 'polls',
      kind: sticker.kind === 'question' ? 'answer' : 'vote',
      parse: (fields) => {
        if (sticker.kind === 'poll') {
          const choice = fields.choice;
          return Number.isInteger(choice) &&
            (choice as number) >= 0 &&
            (choice as number) < (sticker.options ?? 0)
            ? { value: String(choice) }
            : null;
        }
        if (sticker.kind === 'slider') {
          const value = fields.value;
          return typeof value === 'number' && value >= 0 && value <= 100
            ? { value: String(Math.round(value)) }
            : null;
        }
        const body = parseBody(fields.body);
        return body && body.length <= 500 ? { value: body } : null;
      },
      run: async (input, { visitor, repo }) => {
        if (sticker.kind === 'question') {
          await repo.questions.answer(id, visitor, input.value);
          await deps.notify({ title: `New answer to "${sticker.prompt}"`, lines: [input.value] });
          return Response.json({ ok: true }, { status: 201 });
        }
        await repo.polls.vote(id, visitor, input.value);
        const now = await results(id, sticker, { repo } as Platform);
        if (sticker.kind === 'poll') await deps.broadcast(id, now).catch(() => {});
        return Response.json({ ok: true, mine: Number(input.value), results: now });
      },
    });

  return {
    async get(id: string | undefined, platform: Platform): Promise<Response> {
      const sticker = id ? deps.stickers.get(id) : undefined;
      if (!id || !sticker || sticker.kind === 'question') return errorResponse('not_found', 404);
      if (!(await readFlags(platform.flags)).polls) return errorResponse('disabled', 503);
      return Response.json(
        { ok: true, results: await results(id, sticker, platform) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    },

    async post(request: Request, id: string | undefined, platform: Platform): Promise<Response> {
      const sticker = id ? deps.stickers.get(id) : undefined;
      if (!id || !sticker) return errorResponse('not_found', 404);
      return vote(id, sticker)(request, platform);
    },
  };
}
