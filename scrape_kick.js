const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://kick.facepunch.com/', { waitUntil: 'networkidle' });

  const drops = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('a.drop-box'));
    const images = [];

    for (const box of boxes) {
      let img = box.querySelector('video img');
      let src = '';

      if (img && img.src) {
        src = img.src;
      } else {
        const source = box.querySelector('video source');
        if (source && source.src) {
          src = source.src.replace('.mp4', '.jpg');
        }
      }

      if (
        src &&
        /\.(jpg|jpeg|png)$/i.test(src)
      ) {
        images.push(src);
      }
    }

    return [...new Set(images)];
  });

  fs.writeFileSync('kick_imgs.txt', drops.join('\n'));
  await browser.close();
})();
