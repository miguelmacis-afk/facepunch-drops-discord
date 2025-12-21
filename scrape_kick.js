const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  await page.goto('https://kick.facepunch.com/', { waitUntil: 'domcontentloaded' });

  // 1️⃣ Esperar a que aparezcan los drops
  await page.waitForSelector('a.drop-box', { timeout: 15000 });

  // 2️⃣ SCROLL FORZADO (CLAVE)
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 800));
    }
  });

  // 3️⃣ Esperar a que TODOS tengan imagen o video
  await page.waitForFunction(() => {
    const boxes = document.querySelectorAll('a.drop-box');
    if (boxes.length < 4) return false;

    return [...boxes].every(b =>
      b.querySelector('video img[src]') ||
      b.querySelector('video source[src]')
    );
  }, { timeout: 15000 });

  // 4️⃣ Extraer
  const imgs = await page.evaluate(() => {
    return [...document.querySelectorAll('a.drop-box')].map(box => {
      const img = box.querySelector('video img');
      if (img?.src) return img.src;

      const src = box.querySelector('video source');
      if (src?.src) return src.src.replace('.mp4', '.jpg');

      return null;
    }).filter(Boolean);
  });

  fs.writeFileSync('twitch_imgs.txt', [...new Set(imgs)].join('\n'));
  await browser.close();
})();
