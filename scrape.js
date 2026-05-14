const { chromium } = require('playwright');
const fs = require('fs');

async function scrape(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`🌐 Scraping: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    // 1. Esperar a que el contenedor de drops sea visible
    await page.waitForSelector('.drops-group, .drop-box', { timeout: 20000 });

    // 2. Usamos un selector más genérico para capturar tanto <a> como <div> que sean boxes
    const drops = await page.$$eval('.drop-box', (boxes) => {
      return boxes.map(box => {
        // Obtenemos el texto del nombre del drop/streamer
        const dropNameRaw = box.querySelector('.streamer-info span')?.innerText.trim() || 
                           box.querySelector('.drop-type')?.innerText.trim() || '';
        
        const name = box.querySelector('.drop-type')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span')?.innerText.trim() || 'Unknown';
        
        // Imagen: Intentar varias rutas comunes en Facepunch
        const img = box.querySelector('img.drop-img')?.src || 
                    box.querySelector('video img')?.src || 
                    box.querySelector('img')?.src || '';
        
        const id = box.href || img || name;

        // DETECCIÓN DE TIPO:
        // Es general si: el texto lo dice, tiene la clase 'is-general' o no tiene links de Twitch/Kick
        const hasStreamerLinks = box.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]').length > 0;
        const isGeneral = dropNameRaw.toLowerCase().includes('general') || 
                          box.classList.contains('is-general') || 
                          !hasStreamerLinks;

        const streamers = [];
        if (!isGeneral) {
          box.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]').forEach(a => {
            streamers.push({
              name: a.innerText.trim() || dropNameRaw || 'Streamer',
              url: a.href,
              avatar: a.querySelector('img')?.src || ''
            });
          });
        }

        return {
          id,
          name,
          time,
          img,
          streamers,
          type: isGeneral ? 'General' : 'Exclusivo'
        };
      });
    });

    return drops;
  } catch (err) {
    console.error(`❌ Error en ${url}:`, err.message);
    return [];
  } finally {
    await browser.close();
  }
}

(async () => {
  const twitchData = await scrape('https://twitch.facepunch.com/');
  const kickData = await scrape('https://kick.facepunch.com/');

  // Combinamos ambos resultados para procesarlos
  const allScrapedDrops = [...twitchData, ...kickData];

  // Eliminamos duplicados por ID (por si un drop general aparece en ambas webs)
  const uniqueDrops = Array.from(new Map(allScrapedDrops.map(d => [d.id, d])).values());

  const jsonResult = {
    twitch: {
      drops: uniqueDrops.filter(d => d.type === 'Exclusivo'),
      fail: 0,
      hero: null
    },
    kick: {
      // Aquí movemos todos los Generales, independientemente de dónde vengan
      drops: uniqueDrops.filter(d => d.type === 'General'),
      fail: 0,
      hero: null
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));
  
  console.log(`✅ Scraping finalizado:`);
  console.log(`   - Exclusivos: ${jsonResult.twitch.drops.length}`);
  console.log(`   - Generales: ${jsonResult.kick.drops.length}`);
})();
