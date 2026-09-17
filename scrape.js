const { chromium } = require('playwright');
const fs = require('fs');

/**
 * Scraper para Twitch Drops (twitch.facepunch.com)
 */
async function scrapeTwitch() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('🔍 Extrayendo drops de Twitch...');
    await page.goto('https://twitch.facepunch.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.drop-box', { timeout: 15000 });

    const drops = await page.$$eval('.drop-box', boxes => {
      return boxes.map(box => {
        const streamerNameRaw = box.querySelector('.streamer-name, .streamer-info span, .streamer-title')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type, .drop-name')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span, .drop-time')?.innerText.trim() || 'Unknown';
        
        // Extracción de imagen o miniatura de video
        const img = box.querySelector('video img')?.src
          || box.querySelector('video source')?.src?.replace('.mp4', '.jpg')
          || box.querySelector('img.drop-image, img')?.src || '';

        const isGeneral = streamerNameRaw.toLowerCase().includes('general drop') || streamerNameRaw === '';

        // Extraer streamers de Twitch
        const streamers = [];
        box.querySelectorAll('a[href*="twitch.tv"]').forEach(a => {
          const streamerName = a.innerText.trim() || streamerNameRaw || 'Streamer';
          streamers.push({
            name: streamerName,
            url: a.href,
            avatar: a.querySelector('img')?.src || ''
          });
        });

        const dropLink = box.querySelector('a')?.href || '';
        const id = dropLink || img || name;
        const type = isGeneral || streamers.length === 0 ? 'General' : 'Exclusivo';

        return { id, name, time, img, streamers, type };
      });
    });

    return drops;

  } catch (err) {
    console.error('❌ Error scraping Twitch:', err);
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * Scraper para Kick Drops (kick.facepunch.com)
 */
async function scrapeKick() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('🔍 Extrayendo drops de Kick...');
    await page.goto('https://kick.facepunch.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.drop-box', { timeout: 15000 });

    const drops = await page.$$eval('.drop-box', boxes => {
      return boxes.map(box => {
        const streamerNameRaw = box.querySelector('.streamer-name, .streamer-info span, .streamer-title')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type, .drop-name')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span, .drop-time')?.innerText.trim() || 'Unknown';
        
        const img = box.querySelector('video img')?.src
          || box.querySelector('video source')?.src?.replace('.mp4', '.jpg')
          || box.querySelector('img.drop-image, img')?.src || '';

        const isGeneral = streamerNameRaw.toLowerCase().includes('general drop') || streamerNameRaw === '';

        // Extraer streamers de Kick
        const streamers = [];
        box.querySelectorAll('a[href*="kick.com"]').forEach(a => {
          const streamerName = a.innerText.trim() || streamerNameRaw || 'Streamer';
          streamers.push({
            name: streamerName,
            url: a.href,
            avatar: a.querySelector('img')?.src || ''
          });
        });

        const dropLink = box.querySelector('a')?.href || '';
        const id = dropLink || img || name;
        const type = isGeneral || streamers.length === 0 ? 'General' : 'Exclusivo';

        return { id, name, time, img, streamers, type };
      });
    });

    return drops;

  } catch (err) {
    console.error('❌ Error scraping Kick:', err);
    return [];
  } finally {
    await browser.close();
  }
}

// Ejecución principal
(async () => {
  const twitchDrops = await scrapeTwitch();
  const kickDrops = await scrapeKick();

  // Estructura separada por plataforma con exclusivos y generales correctamente asignados
  const jsonResult = {
    twitch: {
      exclusive: twitchDrops.filter(d => d.type === 'Exclusivo'),
      general: twitchDrops.filter(d => d.type === 'General'),
      drops: twitchDrops,
      fail: twitchDrops.length === 0 ? 1 : 0,
      hero: null
    },
    kick: {
      exclusive: kickDrops.filter(d => d.type === 'Exclusivo'),
      general: kickDrops.filter(d => d.type === 'General'),
      drops: kickDrops,
      fail: kickDrops.length === 0 ? 1 : 0,
      hero: null
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));

  console.log(`\n✅ Scraping completado con éxito:`);
  console.log(`   - Twitch: ${jsonResult.twitch.exclusive.length} exclusivos, ${jsonResult.twitch.general.length} generales`);
  console.log(`   - Kick: ${jsonResult.kick.exclusive.length} exclusivos, ${jsonResult.kick.general.length} generales`);
})();
