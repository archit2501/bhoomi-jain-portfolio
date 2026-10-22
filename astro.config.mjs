// @ts-check
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';
import securityHeaders, { isPreviewBuild } from './src/integrations/security-headers';

// SITE_URL is her own domain in production (task 5.2.2); local and CI builds use the test server.
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4447',
  // Every page is prerendered. Only routes that opt out with `export const prerender = false`
  // (the /api/* endpoints) run on the Worker at request time.
  output: 'static',
  adapter: cloudflare({
    // Images are resized to AVIF/WebP with sharp at build time and served as static files,
    // so no Cloudflare Images binding is needed.
    imageService: 'compile',
    // Prerender in Node: the share-card PNGs are drawn with sharp, which can't run in workerd.
    prerenderEnvironment: 'node',
  }),
  // No Astro sessions, so the adapter doesn't provision a SESSION KV namespace.
  session: false,
  // Security headers on every static response, via dist/client/_headers (task 6.4.1).
  integrations: [securityHeaders()],
  vite: {
    // True in builds for the preview Worker (CLOUDFLARE_ENV=preview): robots.txt turns crawlers
    // away and every response says noindex. Read by src/pages/robots.txt.ts and src/worker.ts.
    define: { __PREVIEW_BUILD__: JSON.stringify(isPreviewBuild()) },
  },
});
