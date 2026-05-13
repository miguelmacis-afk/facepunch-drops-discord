const { chromium } = require('playwright');
const fs = require('fs');

async function scrape(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`🔍 Iniciando scraping en: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Esperar explícitamente a que al menos un drop-box aparezca
    await page.waitForSelector('a.drop-box', { timeout: 15000 });

    // Forzar una pequeña espera extra para asegurar que el JS de la web rellene los datos
    await page.waitForTimeout(2000);

    const drops = await page.$$eval('a.drop-box', boxes => {
      return boxes.map(box => {
        const dropNameRaw = box.querySelector('.streamer-info span')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span')?.innerText.trim() || 'Unknown';
        
        // Priorizar el src de la imagen
        const img = box.querySelector('img.drop-img')?.src || 
                    box.querySelector('video img')?.src || 
                    box.querySelector('img')?.src || '';
        
        const id = box.href || img || name;

        // Clasificación mejorada
        // Si tiene el texto "General Drop" o si NO tiene links específicos a streamers
        const isGeneral = dropNameRaw.toLowerCase().includes('general drop');
        const streamerLinks = box.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]');
        
        const streamers = [];
        if (!isGeneral) {
          streamerLinks.forEach(a => {
            streamers.push({
              name: a.innerText.trim() || 'Streamer',
              url: a.href,
              avatar: a.querySelector('img')?.src || ''
            });
          });
        }

        // Si no se encontraron links de streamers pero no dice General, 
        // usamos el nombre del bloque como nombre del streamer (caso común en Facepunch)
        if (streamers.length === 0 && !isGeneral && dropNameRaw) {
          streamers.push({
            name: dropNameRaw,
            url: box.href,
            avatar: ''
          });
        }

        const type = isGeneral || (streamers.length === 0) ? 'General' : 'Exclusivo';

        return { id, name, time, img, streamers, type };
      });
    });

    return drops;

  } catch (err) {
    console.error(`❌ Error scraping ${url}:`, err.message);
    return [];
  } finally {
    await browser.close();
  }
}

(async () => {
  const twitchDrops = await scrape('https://twitch.facepunch.com/');
  const kickDrops = await scrape('https://kick.facepunch.com/');

  // Consolidar y filtrar
  const allDrops = [...twitchDrops, ...kickDrops];
  
  // Eliminamos duplicados por ID por si acaso
  const uniqueDrops = Array.from(new Map(allDrops.map(item => [item.id, item])).values());

  const jsonResult = {
    twitch: {
      drops: uniqueDrops.filter(d => d.type === 'Exclusivo'),
      fail: 0,
      hero: null
    },
    kick: {
      drops: uniqueDrops.filter(d => d.type === 'General'),
      fail: 0,
      hero: null
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));
  console.log(`✅ Scraping completado: 
     - Exclusivos: ${jsonResult.twitch.drops.length}
     - Generales: ${jsonResult.kick.drops.length}`);
})();
