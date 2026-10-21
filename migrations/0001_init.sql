-- The live features' data (task 3.1.1). Apply with:
--   npx wrangler d1 migrations apply DB -c wrangler.jsonc --remote
-- Visitors are anonymous: a random id from a cookie, never a name, email or IP address,
-- except what someone types into a DM or comment themselves.

-- One row per visitor per liked thing (a post slug, or "reel-<id>"). Idempotent by design.
CREATE TABLE likes (
  target TEXT NOT NULL,
  visitor TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (target, visitor)
);

-- Comments wait for Bhoomi's approval; only approved ones are ever served.
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post TEXT NOT NULL,
  visitor TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX comments_by_post ON comments (post, status, created_at);

-- A DM thread is private to whoever holds its secret link (only a hash is stored).
CREATE TABLE dm_threads (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  visitor TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  secret_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX dm_threads_by_visitor ON dm_threads (visitor, updated_at);

CREATE TABLE dm_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES dm_threads (id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('visitor', 'bhoomi', 'ai')),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX dm_messages_by_thread ON dm_messages (thread_id, created_at);

-- Story poll stickers: one vote per visitor per poll, which they can change.
CREATE TABLE poll_votes (
  poll TEXT NOT NULL,
  visitor TEXT NOT NULL,
  option TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll, visitor)
);

-- Story question-box stickers: answers are held like comments.
CREATE TABLE question_answers (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  visitor TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL
);
CREATE INDEX question_answers_by_question ON question_answers (question, status, created_at);
