const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://twitch.facepunch.com/');

  // 1️⃣ Esperar a que existan los drop-box
  await page.waitForSelector('a.drop-box', { timeout: 15000 });

  // 2️⃣ Esperar explícitamente a que TODOS tengan contenido cargado
  await page.waitForFunction(() => {
    const boxes = document.querySelectorAll('a.drop-box');
    if (boxes.length < 4) return false;

    return Array.from(boxes).every(box => {
      const img = box.querySelector('video img');
      const src = box.querySelector('video source');
      return (img && img.src) || (src && src.src);
    });
  }, { timeout: 15000 });

  // 3️⃣ Extraer datos
  const drops = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('a.drop-box'));

    return boxes.map(box => {
      let src = '';

      const img = box.querySelector('video img');
      if (img && img.src) {
        src = img.src;
      } else {
        const source = box.querySelector('video source');
        if (source && source.src) {
          src = source.src.replace('.mp4', '.jpg');
        }
      }

      return src;
    }).filter(Boolean);
  });

  fs.writeFileSync('twitch_imgs.txt', [...new Set(drops)].join('\n'));
  await browser.close();
})();
