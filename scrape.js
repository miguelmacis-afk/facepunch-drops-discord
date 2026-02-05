const { chromium } = require('playwright');
const fs = require('fs');

async function scrape(url, outputFile) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const parsedDrops = await page.$$eval('a.drop-box', boxes =>
      boxes.map(box => {
        // Nombre del drop
        const name = box.querySelector('.drop-type')?.innerText.trim() || 'Unknown Drop';

        // Tiempo de duración
        const time = box.querySelector('.drop-time span')?.innerText.trim() || 'Unknown';

        // Imagen (video poster o MP4 -> JPG)
        const img = box.querySelector('video img')?.src
          || box.querySelector('video source')?.src?.replace('.mp4', '.jpg') || '';

        // Streamers (Twitch/Kick)
        const streamers = [...box.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]')]
          .map(a => ({
            name: a.innerText.trim() || 'Streamer',
            url: a.href,
            avatar: a.querySelector('img')?.src || ''
          }));

        // Tipo
        const type = streamers.length > 0 ? 'Exclusivo' : 'General';

        // ID del drop
        const id = box.href || img || name;

        return { id, name, time, img, streamers, type };
      })
    );

    // Separar por plataforma
    const twitchDrops = parsedDrops.filter(d => d.type === 'Exclusivo');
    const kickDrops = parsedDrops.filter(d => d.type === 'General');

    const jsonResult = {
      twitch: { drops: twitchDrops, fail: 0, hero: null },
      kick: { drops: kickDrops, fail: 0, hero: null }
    };

    fs.writeFileSync(outputFile, JSON.stringify(jsonResult, null, 2));
    console.log(`✅ Scraped ${parsedDrops.length} drops from ${url} → ${outputFile}`);

  } catch (err) {
    console.error('❌ Error scraping:', err);
  } finally {
    await browser.close();
  }
}

// Ejecución
(async () => {
  await scrape('https://twitch.facepunch.com/', 'twitch.json');
  await scrape('https://kick.facepunch.com/', 'kick.json');
})();
