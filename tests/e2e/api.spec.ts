import { expect, test } from '@playwright/test';

// The API doesn't depend on the device, so it runs in one project only.
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'device-independent',
);

test('GET /api/health answers from the Worker: every switch on by default, database up', async ({
  request,
}) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  expect(res.headers()['cache-control']).toBe('no-store');
  expect(await res.json()).toEqual({
    ok: true,
    db: true,
    flags: { likes: true, comments: true, dms: true, polls: true, ai_chat: true },
  });
});

test('pages stay prerendered static files next to the Worker', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/html');
  const astro = await request.get('/og/default.png');
  expect(astro.headers()['content-type']).toBe('image/png');
});
