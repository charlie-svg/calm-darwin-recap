import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 3 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const info = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="mm-sample"]');
  const text = el.textContent;
  const cs = getComputedStyle(el);
  const range = document.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();

  // Measure the same string in a plain canvas with the target font.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const measure = (font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

  const probe = document.createElement('span');
  probe.textContent = text;
  probe.style.cssText = 'position:fixed;left:-9999px;font-size:32px;font-weight:600;font-family:"Noto Sans Myanmar"';
  document.body.appendChild(probe);
  const probeWidth = probe.getBoundingClientRect().width;
  probe.style.fontFamily = 'monospace';
  const fallbackWidth = probe.getBoundingClientRect().width;
  probe.remove();

  return {
    text,
    codePoints: [...text].map((c) => c.codePointAt(0).toString(16)),
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    letterSpacing: cs.letterSpacing,
    lineHeight: cs.lineHeight,
    elBox: { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height },
    textRect: { w: rect.width, h: rect.height },
    canvas15: measure('600 15px "Noto Sans Myanmar"'),
    canvas32: measure('600 32px "Noto Sans Myanmar"'),
    probeWidth32: probeWidth,
    monospaceWidth32: fallbackWidth,
    fontsStatus: document.fonts.status,
    loadedFaces: [...document.fonts].map((f) => `${f.family}/${f.weight}/${f.status}`),
  };
});

console.log(JSON.stringify(info, null, 2));
await page.locator('[data-testid="mm-sample"]').screenshot({ path: 'test-results/diag-mm.png' });
await browser.close();
