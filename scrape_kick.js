const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://kick.facepunch.com/', { waitUntil: 'networkidle' });

  const drops = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));

    return imgs
      .map(img => ({
        src: img.src,
        w: img.naturalWidth,
        h: img.naturalHeight
      }))
      .filter(img =>
        img.src &&
        /\.(jpg|jpeg|png)$/i.test(img.src) &&
        img.w >= 150 &&
        img.h >= 150 &&
        img.w <= 600 &&
        img.h <= 600 &&
        !/logo|icon|banner|avatar|favicon|header|background|promo|marque/i.test(img.src)
      )
      .map(img => img.src);
  });

  const unique = [...new Set(drops)];
  fs.writeFileSync('kick_imgs.txt', unique.join('\n'));

  await browser.close();
})();
