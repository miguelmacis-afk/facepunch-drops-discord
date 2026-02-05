const { chromium } = require('playwright');
const fs = require('fs');

async function scrape(url, outputFile) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const parsedDrops = await page.$$eval('a.drop-box', boxes =>
      boxes.map(box => {
        const dropNameRaw = box.querySelector('.streamer-info span')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span')?.innerText.trim() || 'Unknown';
        const img = box.querySelector('video img')?.src
          || box.querySelector('video source')?.src?.replace('.mp4', '.jpg') || '';
        const id = box.href || img || name;

        // Detectar si es general (por el nombre del streamer)
        const isGeneral = dropNameRaw.includes(' - General Drop');

        // Streamers: solo si no es general
        const streamers = [];
        if (!isGeneral) {
          [...box.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]')].forEach(a => {
            streamers.push({
              name: a.innerText.trim() || 'Streamer',
              url: a.href,
              avatar: a.querySelector('img')?.src || ''
            });
          });
        }

        const type = isGeneral ? 'General' : 'Exclusivo';

        return { id, name, time, img, streamers, type };
      })
    );

    const jsonResult = {
      twitch: { drops: parsedDrops.filter(d => d.type === 'Exclusivo'), fail: 0, hero: null },
      kick: { drops: parsedDrops.filter(d => d.type === 'General'), fail: 0, hero: null }
    };

    fs.writeFileSync(outputFile, JSON.stringify(jsonResult, null, 2));
    console.log(`✅ Scraped ${parsedDrops.length} drops from ${url} → ${outputFile}`);
  } catch (err) {
    console.error('❌ Error scraping:', err);
  } finally {
    await browser.close();
  }
}

// Ejecutar scraping
(async () => {
  await scrape('https://twitch.facepunch.com/', 'drops.json');
})();
