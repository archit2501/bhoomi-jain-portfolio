/**
 * Stand-ins for the outside services during the end-to-end tests, started by Playwright next to
 * the preview server. Memory only.
 *
 * - Bhoomi's notifications: the preview Worker posts each notice to /notify (NOTIFY_WEBHOOK_URL
 *   in .dev.vars.example), and tests read them back from /notices to follow her links.
 * - The Claude API, for "Ask my AI": /anthropic/v1/messages (ANTHROPIC_BASE_URL) streams a canned
 *   answer the way the Messages API does, so no test calls the real API or spends anything.
 *   /anthropic/requests returns every request it was sent. The question picks the answer:
 *   "refuse" ends with a refusal, "fail" with a server error, "slow" takes a while; anything
 *   else gets an answer that cites the résumé and the first post.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.E2E_INBOX_PORT ?? 4457);
const notices = [];
const requests = [];

const sse = (res, event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A Messages API stream: text in pieces, a citation after each piece, then the stop reason. */
async function answer(res, request) {
  const last = request.messages.at(-1);
  const question = typeof last.content === 'string' ? last.content : last.content.at(-1).text;
  if (/\bfail\b/i.test(question)) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'stand-in' } }));
    return;
  }
  const docs = request.messages[0].content.filter((block) => block.type === 'document');
  const refuse = /\brefuse\b/i.test(question);
  const pieces = refuse
    ? []
    : [
        ['From what she has published: ', 0],
        [`${docs[1]?.title ?? 'Her work'} is one of her projects. `, 1],
        [`(Answering: ${question.slice(0, 60)})`, null],
      ];
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  sse(res, {
    type: 'message_start',
    message: {
      id: 'msg_e2e',
      type: 'message',
      role: 'assistant',
      model: request.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  });
  sse(res, {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '', citations: [] },
  });
  for (const [text, cite] of pieces) {
    await wait(/\bslow\b/i.test(question) ? 1500 : 60);
    sse(res, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
    if (cite !== null && docs[cite]) {
      sse(res, {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'citations_delta',
          citation: {
            type: 'char_location',
            cited_text: docs[cite].source.data.slice(0, 20),
            document_index: cite,
            document_title: docs[cite].title,
            start_char_index: 0,
            end_char_index: 20,
            file_id: null,
          },
        },
      });
    }
  }
  sse(res, { type: 'content_block_stop', index: 0 });
  sse(res, {
    type: 'message_delta',
    delta: { stop_reason: refuse ? 'refusal' : 'end_turn', stop_sequence: null },
    usage: { output_tokens: 20 },
  });
  sse(res, { type: 'message_stop' });
  res.end();
}

createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/notify') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        notices.push(JSON.parse(body));
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/anthropic/v1/messages') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        // The SDK sends the key as a bearer token; the API also takes it as x-api-key.
        const apiKey =
          req.headers['x-api-key'] ?? req.headers.authorization?.replace(/^Bearer /, '');
        requests.push({ apiKey, body: JSON.parse(body) });
      } catch {
        res.writeHead(400).end();
        return;
      }
      answer(res, requests.at(-1).body).catch(() => res.end());
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/anthropic/requests') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(requests));
    return;
  }
  if (req.method === 'GET' && req.url === '/notices') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(notices));
    return;
  }
  res.writeHead(req.url === '/' ? 200 : 404).end();
}).listen(PORT, () => console.log(`e2e inbox on ${PORT}`));
