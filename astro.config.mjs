// @ts-check
import { defineConfig } from 'astro/config';

// SITE_URL is her own domain in production (task 5.2.2); local and CI builds use the test server.
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4447',
  output: 'static',
});
