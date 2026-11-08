import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
console.log('chromium version:', browser.version());

const caps = await page.evaluate(() => {
  const v = document.createElement('video');
  return {
    h264_mp4: v.canPlayType('video/mp4; codecs="avc1.42E01E"'),
    mp4_generic: v.canPlayType('video/mp4'),
    vp8_webm: v.canPlayType('video/webm; codecs="vp8"'),
    vp9_webm: v.canPlayType('video/webm; codecs="vp9"'),
    mov: v.canPlayType('video/quicktime'),
  };
});
console.log(JSON.stringify(caps, null, 2));
await browser.close();
