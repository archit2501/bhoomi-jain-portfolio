import { getViteConfig } from 'astro/config';

// Component tests render .astro files with Astro's Container API, so they need Astro's Vite
// plugins. `configFile: false` leaves out astro.config.mjs and with it the Cloudflare adapter,
// whose workerd dev plugins aren't needed to render a component to a string.
export default getViteConfig(
  { test: { name: 'components', include: ['src/**/*.container.test.ts'] } },
  { configFile: false },
);
