const { chromium } = require('playwright');
const fs = require('fs');

async function scrape(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const drops = await page.$$eval('a.drop-box', boxes =>
      boxes.map(box => {
        const dropNameRaw = box.querySelector('.streamer-info span')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span')?.innerText.trim() || 'Unknown';
        const img = box.querySelector('video img')?.src
          || box.querySelector('video source')?.src?.replace('.mp4', '.jpg') || '';
        const id = box.href || img || name;

        // Detectamos generales si el texto dice "- General Drop" o no hay links a streamers
        const isGeneral = dropNameRaw.includes(' - General Drop');

        // Streamers: Twitch o Kick
        const streamers = [];
        box.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]').forEach(a => {
          const streamerNameRaw = a.innerText.trim();
          // Ignorar si es general
          if (!isGeneral) {
            streamers.push({
              name: streamerNameRaw || 'Streamer',
              url: a.href,
              avatar: a.querySelector('img')?.src || ''
            });
          }
        });

        // Tipo: General si es general, exclusivo si hay streamers
        const type = isGeneral || streamers.length === 0 ? 'General' : 'Exclusivo';

        return { id, name, time, img, streamers, type };
      })
    );

    return drops;

  } catch (err) {
    console.error(`❌ Error scraping ${url}:`, err);
    return [];
  } finally {
    await browser.close();
  }
}

// Ejecutar scraping completo
(async () => {
  const twitchDrops = await scrape('https://twitch.facepunch.com/');
  const kickDrops = await scrape('https://kick.facepunch.com/');

  // Separar exclusivos y generales
  const jsonResult = {
    twitch: {
      drops: twitchDrops.filter(d => d.type === 'Exclusivo'),
      fail: 0,
      hero: null
    },
    kick: {
      drops: [...twitchDrops, ...kickDrops].filter(d => d.type === 'General'),
      fail: 0,
      hero: null
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));
  console.log(`✅ Scraping completado: ${jsonResult.twitch.drops.length} exclusivos, ${jsonResult.kick.drops.length} generales`);
})();
