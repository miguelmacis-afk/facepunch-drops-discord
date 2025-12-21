const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://twitch.facepunch.com/', { waitUntil: 'networkidle' });

  // 🔽 SCROLL para cargar lazy images
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 500));
    }
  });

  const drops = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));

    return imgs
      .map(img => ({
        src: img.src || img.dataset.src || img.dataset.lazy || '',
      }))
      .filter(src =>
        src &&
        /\.(jpg|jpeg|png)$/i.test(src) &&
        !/logo|icon|banner|avatar|favicon|header|background|promo|marque/i.test(src)
      );
  });

  const unique = [...new Set(drops)];
  fs.writeFileSync('twitch_imgs.txt', unique.join('\n'));

  await browser.close();
})();
