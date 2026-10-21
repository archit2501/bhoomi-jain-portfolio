/**
 * A stand-in for Bhoomi's notifications during the end-to-end tests: the preview Worker posts
 * each notice here (NOTIFY_WEBHOOK_URL in .dev.vars.example), and tests read them back to follow
 * her approve and reject links. Memory only; started by Playwright next to the preview server.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.E2E_INBOX_PORT ?? 4457);
const notices = [];

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
  if (req.method === 'GET' && req.url === '/notices') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(notices));
    return;
  }
  res.writeHead(req.url === '/' ? 200 : 404).end();
}).listen(PORT, () => console.log(`e2e inbox on ${PORT}`));
