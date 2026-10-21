import { expect, test } from '@playwright/test';
import { posts } from './fixtures';

const withDiagram = posts.find((p) => p.data.media.some((m) => m.type === 'diagram'));
const withTldr = posts.find((p) => p.data.tldr);
const withMarkdown = posts.find((p) => /\*\*[^*]+\*\*/.test(p.body));

test.describe('a project post as a case study', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('has an architecture slide that reads as text to screen readers', async ({ page }) => {
    test.skip(!withDiagram, 'no post has a diagram');
    const post = withDiagram!;
    const index = post.data.media.findIndex((m) => m.type === 'diagram');
    const diagram = post.data.media[index] as Extract<
      (typeof post.data.media)[number],
      { type: 'diagram' }
    >;
    await page.goto(`/p/${post.id}/`);
    const slide = page.locator('.slide').nth(index);
    const img = slide.getByRole('img', { name: new RegExp(`^${diagram.title}:`) });
    await expect(img).toBeAttached();
    const first = diagram.nodes.find((n) => n.id === diagram.edges[0].from)!;
    await expect(img).toHaveAccessibleName(new RegExp(`${first.label} to `));
    await expect(slide.locator('.node')).toHaveCount(diagram.nodes.length);
  });

  test('pins her TL;DR under the caption', async ({ page }) => {
    test.skip(!withTldr, 'no post has a TL;DR');
    await page.goto(`/p/${withTldr!.id}/`);
    // In the comments column; the phone's comments sheet holds a second copy.
    const pinned = page.locator('.comments .comment.pinned');
    await expect(pinned).toContainText(withTldr!.data.tldr!);
    await expect(pinned.locator('.meta')).toHaveText('Pinned');
  });

  test('renders the caption as markdown', async ({ page }) => {
    test.skip(!withMarkdown, 'no caption uses markdown');
    await page.goto(`/p/${withMarkdown!.id}/`);
    const bold = withMarkdown!.body.match(/\*\*([^*]+)\*\*/)![1];
    await expect(page.locator('.post-view .caption strong', { hasText: bold })).toBeVisible();
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).not.toContain('**');
  });

  test('the grid tile and the post page share a transition name', async ({ page }) => {
    const post = posts[0];
    await page.goto('/');
    await expect(page.locator(`#panel-posts a[data-post="${post.id}"]`)).toHaveCSS(
      'view-transition-name',
      `post-${post.id}`,
    );
    await page.goto(`/p/${post.id}/`);
    await expect(page.locator('.post-view .media')).toHaveCSS(
      'view-transition-name',
      `post-${post.id}`,
    );
  });
});

test('a tag link (/explore/?q=…) opens search with that query', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explore/?q=FastAPI');
  const panel = page.getByRole('dialog', { name: 'Search' });
  await expect(panel).toBeVisible();
  await expect(page.getByRole('searchbox', { name: /Search projects/ })).toHaveValue('FastAPI');
  await expect(panel.locator('.result-title').first()).toHaveText('FastAPI');
});
