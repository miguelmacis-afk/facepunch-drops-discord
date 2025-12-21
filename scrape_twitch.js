const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://twitch.facepunch.com/', { waitUntil: 'networkidle' });

  const drops = await page.evaluate(() => {
    // Cada drop está en una "reward card"
    const cards = Array.from(document.querySelectorAll('[class*="reward"], [class*="drop"], [class*="item"]'));

    const images = [];

    for (const card of cards) {
      const img =
        card.querySelector('img') ||
        card.querySelector('[style*="background-image"]');

      if (!img) continue;

      let src = '';

      if (img.tagName === 'IMG') {
        src = img.src || img.dataset.src || '';
      } else {
        const match = img.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
        if (match) src = match[1];
      }

      if (
        src &&
        /\.(jpg|jpeg|png)$/i.test(src) &&
        !/logo|icon|banner|avatar|favicon|header|background|promo|marque/i.test(src)
      ) {
        images.push(src);
      }
    }

    return [...new Set(images)];
  });

  fs.writeFileSync('twitch_imgs.txt', drops.join('\n'));
  await browser.close();
})();
