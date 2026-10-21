/**
 * The DM API as the Astro routes use it: topics from the dm-threads content, notices and the
 * reply secret from the Worker's environment. Built once per isolate.
 */
import { getCollection } from 'astro:content';
import { env } from 'cloudflare:workers';
import { dmApi } from '../../../lib/server/dms';
import { notifyBhoomi } from '../../../lib/server/notify';

let api: Promise<ReturnType<typeof dmApi>> | undefined;

export const dms = () =>
  (api ??= getCollection('dmThreads').then((threads) =>
    dmApi({
      topics: new Map(threads.map((t) => [t.id, { label: t.data.label, ai: t.data.ai }])),
      notify: (notice) => notifyBhoomi(notice, env),
      secret: env.APPROVAL_SECRET,
    }),
  ));
