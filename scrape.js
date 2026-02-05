const { chromium } = require('playwright');
const fs = require('fs');

async function scrape(url, file) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  const drops = await page.$$eval('a.drop-box', boxes =>
    boxes.map(b => {
      const name = b.querySelector('.drop-type')?.innerText.trim() || '';
      const time = b.querySelector('.drop-time span')?.innerText.trim() || '';
      const img =
        b.querySelector('video img')?.src ||
        b.querySelector('video source')?.src?.replace('.mp4', '.jpg') ||
        null;

      // Streamers (puede estar vacío)
      const streamers = [...b.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]')]
        .map(a => ({
          name: a.innerText.trim(),
          url: a.href,
          avatar: a.querySelector('img')?.src || ''
        }))
        .filter(s => s.name && s.url);

      const id = b.href || img || name;

      // Tipo: Exclusivo si hay streamer, General si no
      const type = streamers.length > 0 ? "Exclusivo" : "General";

      return { id, name, time, img, streamers, type };
    })
  );

  fs.writeFileSync(file, JSON.stringify({ drops, eventImg: null }, null, 2));
  console.log(`✅ ${file} detectados: ${drops.length}`);
  await browser.close();
}

// Ejecutar scraping
(async () => {
  await scrape('https://twitch.facepunch.com/', 'twitch.json');
  await scrape('https://kick.facepunch.com/', 'kick.json');
})();
