/**
 * The repository layer: every SQL statement the live features run, behind small typed methods.
 * Handlers never write SQL. It takes any D1-shaped database, so the same code runs on Cloudflare,
 * in `astro preview` and in the Worker integration tests (migrations/ holds the schema).
 */

/** The part of D1's API this module uses. */
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export type Review = 'pending' | 'approved' | 'rejected';
export type Sender = 'visitor' | 'bhoomi' | 'ai';

export interface Comment {
  id: string;
  post: string;
  name: string;
  body: string;
  status: Review;
  createdAt: number;
}

export interface DmMessage {
  id: string;
  sender: Sender;
  body: string;
  createdAt: number;
}

export interface DmThread {
  id: string;
  topic: string;
  name: string;
  email: string | null;
  createdAt: number;
  updatedAt: number;
  messages: DmMessage[];
}

/** Hex SHA-256, for thread secrets: only the hash is stored. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A url-safe random token: 16 bytes for ids, 24 for secrets. */
export function randomToken(bytes = 16): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function createRepo(db: D1Like, now: () => number = Date.now) {
  return {
    likes: {
      /** True when this visitor's like is new; liking twice changes nothing. */
      async add(target: string, visitor: string): Promise<boolean> {
        const { meta } = await db
          .prepare('INSERT OR IGNORE INTO likes (target, visitor, created_at) VALUES (?, ?, ?)')
          .bind(target, visitor, now())
          .run();
        return meta.changes > 0;
      },
      async remove(target: string, visitor: string): Promise<boolean> {
        const { meta } = await db
          .prepare('DELETE FROM likes WHERE target = ? AND visitor = ?')
          .bind(target, visitor)
          .run();
        return meta.changes > 0;
      },
      async count(target: string): Promise<number> {
        const row = await db
          .prepare('SELECT COUNT(*) AS n FROM likes WHERE target = ?')
          .bind(target)
          .first<{ n: number }>();
        return row?.n ?? 0;
      },
      async has(target: string, visitor: string): Promise<boolean> {
        const row = await db
          .prepare('SELECT 1 AS yes FROM likes WHERE target = ? AND visitor = ?')
          .bind(target, visitor)
          .first();
        return row !== null;
      },
    },

    comments: {
      /** Every new comment waits for Bhoomi. */
      async create(input: {
        post: string;
        visitor: string;
        name: string;
        body: string;
      }): Promise<string> {
        const id = randomToken();
        await db
          .prepare(
            'INSERT INTO comments (id, post, visitor, name, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(id, input.post, input.visitor, input.name, input.body, 'pending', now())
          .run();
        return id;
      },
      /** Only approved comments, oldest first. Nothing else is ever served. */
      async approved(post: string, limit = 50): Promise<Comment[]> {
        const { results } = await db
          .prepare(
            "SELECT id, post, name, body, status, created_at AS createdAt FROM comments WHERE post = ? AND status = 'approved' ORDER BY created_at LIMIT ?",
          )
          .bind(post, limit)
          .all<Comment>();
        return results;
      },
      async get(id: string): Promise<Comment | null> {
        return db
          .prepare(
            'SELECT id, post, name, body, status, created_at AS createdAt FROM comments WHERE id = ?',
          )
          .bind(id)
          .first<Comment>();
      },
      /** Approve or reject a pending comment. A decided comment stays decided. */
      async decide(id: string, status: Exclude<Review, 'pending'>): Promise<boolean> {
        const { meta } = await db
          .prepare(
            "UPDATE comments SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
          )
          .bind(status, now(), id)
          .run();
        return meta.changes > 0;
      },
    },

    dms: {
      /** A new thread and its first message. The secret is returned once and never stored. */
      async start(input: {
        topic: string;
        visitor: string;
        name: string;
        email?: string | null;
        body: string;
      }): Promise<{ id: string; secret: string }> {
        const id = randomToken();
        const secret = randomToken(24);
        const at = now();
        await db.batch([
          db
            .prepare(
              'INSERT INTO dm_threads (id, topic, visitor, name, email, secret_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .bind(
              id,
              input.topic,
              input.visitor,
              input.name,
              input.email ?? null,
              await sha256(secret),
              at,
              at,
            ),
          db
            .prepare(
              'INSERT INTO dm_messages (id, thread_id, sender, body, created_at) VALUES (?, ?, ?, ?, ?)',
            )
            .bind(randomToken(), id, 'visitor', input.body, at),
        ]);
        return { id, secret };
      },
      async reply(threadId: string, sender: Sender, body: string): Promise<string> {
        const id = randomToken();
        const at = now();
        await db.batch([
          db
            .prepare(
              'INSERT INTO dm_messages (id, thread_id, sender, body, created_at) VALUES (?, ?, ?, ?, ?)',
            )
            .bind(id, threadId, sender, body, at),
          db.prepare('UPDATE dm_threads SET updated_at = ? WHERE id = ?').bind(at, threadId),
        ]);
        return id;
      },
      /** The thread for Bhoomi, through a signed link: no visitor secret needed. */
      async read(threadId: string): Promise<DmThread | null> {
        const thread = await db
          .prepare(
            'SELECT id, topic, name, email, created_at AS createdAt, updated_at AS updatedAt FROM dm_threads WHERE id = ?',
          )
          .bind(threadId)
          .first<Omit<DmThread, 'messages'>>();
        if (!thread) return null;
        const { results } = await db
          .prepare(
            'SELECT id, sender, body, created_at AS createdAt FROM dm_messages WHERE thread_id = ? ORDER BY created_at, rowid',
          )
          .bind(threadId)
          .all<DmMessage>();
        return { ...thread, messages: results };
      },
      /** The thread, if the secret matches; null otherwise (no hint which part was wrong). */
      async open(threadId: string, secret: string): Promise<DmThread | null> {
        const match = await db
          .prepare('SELECT 1 AS yes FROM dm_threads WHERE id = ? AND secret_hash = ?')
          .bind(threadId, await sha256(secret))
          .first();
        return match ? this.read(threadId) : null;
      },
    },

    polls: {
      /** One vote per visitor; voting again changes it. */
      async vote(poll: string, visitor: string, option: string): Promise<void> {
        await db
          .prepare(
            'INSERT INTO poll_votes (poll, visitor, option, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (poll, visitor) DO UPDATE SET option = excluded.option, created_at = excluded.created_at',
          )
          .bind(poll, visitor, option, now())
          .run();
      },
      /** Emoji sliders store each visitor's 0-100 as their "option": the average, and how many. */
      async average(poll: string): Promise<{ average: number; count: number }> {
        const row = await db
          .prepare(
            'SELECT AVG(CAST(option AS REAL)) AS average, COUNT(*) AS count FROM poll_votes WHERE poll = ?',
          )
          .bind(poll)
          .first<{ average: number | null; count: number }>();
        return { average: Math.round(row?.average ?? 0), count: row?.count ?? 0 };
      },
      async results(poll: string): Promise<Record<string, number>> {
        const { results } = await db
          .prepare('SELECT option, COUNT(*) AS n FROM poll_votes WHERE poll = ? GROUP BY option')
          .bind(poll)
          .all<{ option: string; n: number }>();
        return Object.fromEntries(results.map((r) => [r.option, r.n]));
      },
    },

    questions: {
      async answer(question: string, visitor: string, body: string): Promise<string> {
        const id = randomToken();
        await db
          .prepare(
            'INSERT INTO question_answers (id, question, visitor, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .bind(id, question, visitor, body, 'pending', now())
          .run();
        return id;
      },
    },

    totals: {
      /**
       * Site-wide counts for Insights (task 4.2.2): only totals, nothing about any one visitor.
       * "Answered" is the conversations she has replied to.
       */
      async site(): Promise<SiteTotals> {
        const row = await db
          .prepare(
            `SELECT
              (SELECT count(*) FROM likes) AS likes,
              (SELECT count(*) FROM comments WHERE status = 'approved') AS comments,
              (SELECT count(*) FROM dm_threads) AS conversations,
              (SELECT count(DISTINCT thread_id) FROM dm_messages WHERE sender = 'bhoomi') AS answered,
              (SELECT count(*) FROM poll_votes) AS votes`,
          )
          .first<SiteTotals>();
        if (!row) throw new Error('totals: no answer from the database');
        return row;
      },
    },
  };
}

export interface SiteTotals {
  likes: number;
  comments: number;
  conversations: number;
  answered: number;
  votes: number;
}

export type Repo = ReturnType<typeof createRepo>;
