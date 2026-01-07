const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const url = process.argv[2];
  const out = process.argv[3];

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto(urlA, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a.drop-box', { timeout: 20000 });

  // Scroll forzado
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, window.innerHeight);
      await new Promise(r => setTimeout(r, 600));
    }
  });

  const drops = await page.evaluate(() =>
    [...document.querySelectorAll('a.drop-box')].map(box => ({
      id: box.querySelector('.drop-counter')?.dataset.itemid,
      name: box.querySelector('.drop-type')?.innerText ?? 'Drop',
      time: box.querySelector('.drop-time span')?.innerText ?? 'Unknown',
      img:
        box.querySelector('video img')?.src ||
        box.querySelector('video source')?.src?.replace('.mp4', '.jpg') ||
        null
    })).filter(d => d.id)
  );

  fs.writeFileSync(out, JSON.stringify(drops, null, 2));
  await browser.close();
})();
