/**
 * After Lighthouse CI has measured the build that's about to ship (deploy.yml, production), this
 * writes its scores into the site as /lighthouse.json for Insights (task 4.2.2): each page's
 * representative run, when it was measured, and a link to the Actions run that measured it.
 * With no Lighthouse results it writes nothing, and Insights says the scores are unavailable.
 *
 *   node scripts/lighthouse-summary.mjs [.lighthouseci] [dist/client/lighthouse.json]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/** The site path of a page LHCI measured from the static build: ".../p/x/index.html" → "/p/x/". */
export function pagePath(url) {
  const path = new URL(url).pathname.replace(/index\.html$/, '');
  return path === '/404.html' ? '/404' : path;
}

/**
 * The summary from LHCI's manifest (one entry per run, one representative per page), and when
 * each report was taken. Scores are 0–100, as Lighthouse shows them.
 */
export function summarize(manifest, readReport, meta) {
  const pages = manifest
    .filter((run) => run.isRepresentativeRun)
    .map((run) => {
      const scores = {};
      for (const category of CATEGORIES) {
        const score = run.summary?.[category];
        if (typeof score !== 'number') throw new Error(`no ${category} score for ${run.url}`);
        scores[category] = Math.round(score * 100);
      }
      return { path: pagePath(run.url), scores, measuredAt: readReport(run.jsonPath).fetchTime };
    });
  if (!pages.length) throw new Error('no representative runs');
  const measuredAt = pages.map((p) => p.measuredAt).sort()[0];
  return {
    version: 1,
    measuredAt,
    lighthouseVersion: readReport(manifest[0].jsonPath).lighthouseVersion,
    source: meta.source ?? null,
    commit: meta.commit ?? null,
    pages: pages.map(({ path, scores }) => ({ path, scores })),
  };
}

function main() {
  const [dir = '.lighthouseci', out = 'dist/client/lighthouse.json'] = process.argv.slice(2);
  const manifestPath = `${dir}/manifest.json`;
  if (!existsSync(manifestPath)) {
    console.log(`lighthouse-summary: no ${manifestPath}; nothing written`);
    return;
  }
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SHA } = process.env;
  const source =
    GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
      : undefined;
  const summary = summarize(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    (path) => JSON.parse(readFileSync(path, 'utf8')),
    { source, commit: GITHUB_SHA },
  );
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`lighthouse-summary: ${summary.pages.length} pages written to ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
