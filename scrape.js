const { chromium } = require('playwright');
const fs = require('fs');

async function scrape(url, outputFile) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  const drops = await page.$$eval('a.drop-box', boxes =>
    boxes.map(box => {
      const name = box.querySelector('.drop-type')?.innerText.trim() || '';
      const time = box.querySelector('.drop-time span')?.innerText.trim() || '';
      const img = box.querySelector('video img')?.src || box.querySelector('video source')?.src?.replace('.mp4', '.jpg') || '';

      // Streamers (Twitch/Kick)
      const streamers = [...box.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]')]
        .map(a => ({
          name: a.innerText.trim() || 'Streamer',
          url: a.href,
          avatar: a.querySelector('img')?.src || ''
        }));

      const type = streamers.length > 0 ? 'Exclusivo' : 'General';
      const id = box.href || img || name;

      return { id, name, time, img, streamers, type };
    })
  );

  fs.writeFileSync(outputFile, JSON.stringify({ drops, fail: 0, hero: null }, null, 2));
  console.log(`✅ Scraped ${drops.length} drops from ${url}`);
  await browser.close();
}

// Ejemplo de ejecución
(async () => {
  await scrape('https://twitch.facepunch.com/', 'twitch.json');
  await scrape('https://kick.facepunch.com/', 'kick.json');
})();
