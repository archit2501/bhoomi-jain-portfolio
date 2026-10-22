import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRepo, randomToken, sha256, type D1Like, type Repo } from './db';
import { localBindings, sqlStatements } from './testing';

// Worker integration tests: the real schema in a real (local, in-memory) D1 database.
let db: D1Like;
let repo: Repo;
let dispose: () => Promise<void>;
let clock = 1_700_000_000_000;

beforeAll(async () => {
  const local = await localBindings();
  db = local.env.DB;
  dispose = local.dispose;
  repo = createRepo(db, () => (clock += 1000));
}, 120_000);

afterAll(async () => dispose?.());

describe('likes', () => {
  it('counts each visitor once, however often they like', async () => {
    expect(await repo.likes.add('smartblog-ai', 'v1')).toBe(true);
    expect(await repo.likes.add('smartblog-ai', 'v1')).toBe(false);
    expect(await repo.likes.add('smartblog-ai', 'v2')).toBe(true);
    expect(await repo.likes.count('smartblog-ai')).toBe(2);
    expect(await repo.likes.has('smartblog-ai', 'v1')).toBe(true);
    expect(await repo.likes.has('wearduds', 'v1')).toBe(false);
  });

  it('unliking removes only that visitor, and twice is harmless', async () => {
    expect(await repo.likes.remove('smartblog-ai', 'v1')).toBe(true);
    expect(await repo.likes.remove('smartblog-ai', 'v1')).toBe(false);
    expect(await repo.likes.count('smartblog-ai')).toBe(1);
    expect(await repo.likes.count('nothing-here')).toBe(0);
  });
});

describe('comments', () => {
  it('holds every new comment until Bhoomi approves it', async () => {
    const id = await repo.comments.create({
      post: 'themobiadz',
      visitor: 'v1',
      name: 'Asha',
      body: 'Great work!',
    });
    expect((await repo.comments.get(id))?.status).toBe('pending');
    expect(await repo.comments.approved('themobiadz')).toEqual([]);

    expect(await repo.comments.decide(id, 'approved')).toBe(true);
    const shown = await repo.comments.approved('themobiadz');
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ id, name: 'Asha', body: 'Great work!', status: 'approved' });
  });

  it('a decision is final, and rejected comments are never served', async () => {
    const id = await repo.comments.create({
      post: 'themobiadz',
      visitor: 'v2',
      name: 'Spam',
      body: 'buy now',
    });
    expect(await repo.comments.decide(id, 'rejected')).toBe(true);
    expect(await repo.comments.decide(id, 'approved')).toBe(false);
    expect((await repo.comments.approved('themobiadz')).map((c) => c.id)).not.toContain(id);
    expect(await repo.comments.get('missing')).toBeNull();
  });

  it('serves approved comments oldest first', async () => {
    const a = await repo.comments.create({ post: 'p', visitor: 'v', name: 'A', body: '1' });
    const b = await repo.comments.create({ post: 'p', visitor: 'v', name: 'B', body: '2' });
    await repo.comments.decide(b, 'approved');
    await repo.comments.decide(a, 'approved');
    expect((await repo.comments.approved('p')).map((c) => c.name)).toEqual(['A', 'B']);
  });
});

describe('DMs', () => {
  it('opens a thread only with its secret, which is stored as a hash', async () => {
    const { id, secret } = await repo.dms.start({
      topic: 'hire',
      visitor: 'v1',
      name: 'Recruiter',
      email: 'r@example.com',
      body: 'Are you open to roles?',
    });
    const stored = await db
      .prepare('SELECT secret_hash FROM dm_threads WHERE id = ?')
      .bind(id)
      .first<{ secret_hash: string }>();
    expect(stored?.secret_hash).toBe(await sha256(secret));
    expect(stored?.secret_hash).not.toContain(secret);

    expect(await repo.dms.open(id, 'wrong-secret')).toBeNull();
    expect(await repo.dms.open('wrong-id', secret)).toBeNull();
    const thread = await repo.dms.open(id, secret);
    expect(thread).toMatchObject({ topic: 'hire', name: 'Recruiter', email: 'r@example.com' });
    expect(thread?.messages.map((m) => [m.sender, m.body])).toEqual([
      ['visitor', 'Are you open to roles?'],
    ]);
  });

  it('keeps replies in order and moves the thread up', async () => {
    const { id, secret } = await repo.dms.start({
      topic: 'hi',
      visitor: 'v2',
      name: 'Friend',
      body: 'Hello!',
    });
    const before = (await repo.dms.open(id, secret))!.updatedAt;
    await repo.dms.reply(id, 'bhoomi', 'Hi there');
    await repo.dms.reply(id, 'visitor', 'How are you?');
    const thread = await repo.dms.open(id, secret);
    expect(thread?.email).toBeNull();
    expect(thread?.messages.map((m) => m.sender)).toEqual(['visitor', 'bhoomi', 'visitor']);
    expect(thread!.updatedAt).toBeGreaterThan(before);
  });

  it('deleting a thread deletes its messages', async () => {
    const { id } = await repo.dms.start({ topic: 't', visitor: 'v', name: 'N', body: 'x' });
    await db.prepare('PRAGMA foreign_keys = ON').run();
    await db.prepare('DELETE FROM dm_threads WHERE id = ?').bind(id).run();
    const left = await db
      .prepare('SELECT COUNT(*) AS n FROM dm_messages WHERE thread_id = ?')
      .bind(id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe('polls and questions', () => {
  it('one vote per visitor, which they can change', async () => {
    await repo.polls.vote('stack', 'v1', 'react');
    await repo.polls.vote('stack', 'v2', 'react');
    await repo.polls.vote('stack', 'v3', 'node');
    await repo.polls.vote('stack', 'v1', 'node');
    expect(await repo.polls.results('stack')).toEqual({ react: 1, node: 2 });
    expect(await repo.polls.results('empty')).toEqual({});
  });

  it('answers are held for review', async () => {
    const id = await repo.questions.answer('ask-me', 'v1', 'What do you build?');
    const row = await db
      .prepare('SELECT status, body FROM question_answers WHERE id = ?')
      .bind(id)
      .first();
    expect(row).toEqual({ status: 'pending', body: 'What do you build?' });
  });
});

describe('site totals', () => {
  it('counts likes, approved comments, conversations, the ones she answered, and votes', async () => {
    const before = await repo.totals.site();
    await repo.likes.add('totals-post', 'tv1');
    await repo.likes.add('totals-post', 'tv2');
    const pending = await repo.comments.create({
      post: 'totals-post',
      visitor: 'tv1',
      name: 'A',
      body: 'Hi',
    });
    const approved = await repo.comments.create({
      post: 'totals-post',
      visitor: 'tv2',
      name: 'B',
      body: 'Yo',
    });
    await repo.comments.decide(approved, 'approved');
    const quiet = await repo.dms.start({
      topic: 'hello',
      visitor: 'tv1',
      name: 'A',
      body: 'Hello',
    });
    const answered = await repo.dms.start({
      topic: 'hire',
      visitor: 'tv2',
      name: 'B',
      body: 'Role?',
    });
    await repo.dms.reply(answered.id, 'bhoomi', 'Thanks!');
    await repo.dms.reply(answered.id, 'bhoomi', 'Also…');
    await repo.polls.vote('totals-poll', 'tv1', '0');
    expect(pending).toBeTruthy();
    expect(quiet).toBeTruthy();
    expect(await repo.totals.site()).toEqual({
      likes: before.likes + 2,
      comments: before.comments + 1,
      conversations: before.conversations + 2,
      answered: before.answered + 1,
      votes: before.votes + 1,
    });
  });
});

describe('the schema', () => {
  it('rejects a status or sender the app never writes', async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO comments (id, post, visitor, name, body, status, created_at) VALUES ('x', 'p', 'v', 'n', 'b', 'live', 0)",
        )
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare(
          "INSERT INTO dm_messages (id, thread_id, sender, body, created_at) VALUES ('y', 'z', 'admin', 'b', 0)",
        )
        .run(),
    ).rejects.toThrow();
  });
});

describe('helpers', () => {
  it('random tokens are url-safe and unique', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken(24)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('sqlStatements drops comments and splits on statement ends only', () => {
    expect(
      sqlStatements(
        "-- note\nCREATE TABLE a (x TEXT CHECK (x IN ('a;b')));\n\nCREATE INDEX i ON a (x);\n",
      ),
    ).toEqual(["CREATE TABLE a (x TEXT CHECK (x IN ('a;b')))", 'CREATE INDEX i ON a (x)']);
  });
});
