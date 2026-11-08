/**
 * smoke-dist.mjs — proves the optimised bundle (dist/) runs, not just the dev
 * server: uploads the real H.264/AAC dummy.mp4 and checks the preview decodes.
 * Run against `vite preview` on :4173.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

try {
  console.log(`[ACTION] Navigating to ${BASE} (production build)...`);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.locator('[data-testid="file-input"]').setInputFiles(resolve('dummy.mp4'));
  await page.locator('[data-testid="preview-card"]').waitFor({ state: 'visible', timeout: 20_000 });

  const src = await page.locator('[data-testid="video-preview"]').getAttribute('src');
  assert.ok(src?.startsWith('blob:'), 'no blob src in production bundle');
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="video-preview"]');
      return el instanceof HTMLVideoElement && el.videoWidth > 0;
    },
    null,
    { timeout: 20_000 },
  );
  const meta = await page.locator('[data-testid="file-size"]').innerText();
  const dur = await page.locator('[data-testid="file-duration"]').innerText();
  assert.equal(meta.trim(), '169.4 KB');
  assert.equal(dur.trim(), '00:05');
  assert.deepEqual(errors, []);
  console.log(`  PASS  dist bundle decoded video (${meta.trim()} / ${dur.trim()}), 0 console errors`);
  await page.screenshot({ path: 'test-results/prod-smoke.png' });
  console.log('  PASS  screenshot -> test-results/prod-smoke.png');
} finally {
  await context.close();
  await browser.close();
}
