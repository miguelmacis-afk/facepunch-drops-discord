const { chromium } = require('playwright');
const fs = require('fs');

const SYSTEMS = {
  twitch: {
    url: 'https://twitch.facepunch.com/',
    container: '.drop-box',
    platformLink: 'twitch.tv'
  },
  kick: {
    url: 'https://kick.facepunch.com/',
    container: '.drop-box',
    platformLink: 'kick.com'
  }
};

async function scrapePlatform(systemKey) {
  const config = SYSTEMS[systemKey];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`🌐 Scraping ${systemKey.toUpperCase()}...`);
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Esperar a que la lista de drops esté cargada
    await page.waitForSelector('.drop-box', { timeout: 15000 });
    // Pequeño delay extra para asegurar que el JS de Facepunch termine de rellenar los datos
    await page.waitForTimeout(2000);

    const hero = await page.$eval('.hero-image img', img => img.src).catch(() => null);

    const drops = await page.$$eval('.drop-box', (boxes, platformLink) => {
      return boxes.map(box => {
        // 1. EL NOMBRE DEL OBJETO (Siempre existe)
        const name = box.querySelector('.drop-type')?.innerText.trim() || 'Unknown Drop';
        
        // 2. EL STREAMER (Puede no existir en generales)
        // Buscamos cualquier texto dentro de streamer-info o el span de nombre
        const streamerName = box.querySelector('.streamer-name')?.innerText.trim() || 
                             box.querySelector('.streamer-info')?.innerText.trim() || "";
        
        // 3. EL TIEMPO
        const time = box.querySelector('.drop-time span')?.innerText.trim() || 
                     box.querySelector('.drop-time')?.innerText.trim() || "Unknown";

        // 4. LA IMAGEN
        const img = box.querySelector('video img')?.src || 
                    box.querySelector('img.drop-img')?.src || 
                    box.querySelector('img')?.src || "";

        // 5. EL LINK (Importante: puede estar en el box mismo o en un <a> interno)
        const url = box.href || box.querySelector('a')?.href || "";

        // --- LÓGICA DE CLASIFICACIÓN ---
        // Si el link es el directorio general de Rust, es GENERAL.
        const isGeneral = url.toLowerCase().includes('/directory/category/rust') || 
                          url.toLowerCase().includes('/directory/game/rust') ||
                          streamerName === "";

        return {
          id: url + name,
          name,
          time,
          img,
          streamers: isGeneral ? [] : [{
            name: streamerName,
            url: url,
            avatar: box.querySelector('.db-avatar img')?.src || ""
          }],
          type: isGeneral ? 'General' : 'Exclusivo'
        };
      });
    }, config.platformLink);

    return { drops, hero };
  } catch (err) {
    console.error(`❌ Error en ${systemKey}:`, err.message);
    return { drops: [], hero: null };
  } finally {
    await browser.close();
  }
}

(async () => {
  const twitchData = await scrapePlatform('twitch');
  const kickData = await scrapePlatform('kick');

  // Unificar y eliminar duplicados (usando ID)
  const allData = [...twitchData.drops, ...kickData.drops];
  const uniqueDrops = Array.from(new Map(allData.map(d => [d.id, d])).values());

  const jsonResult = {
    twitch: {
      drops: uniqueDrops.filter(d => d.type === 'Exclusivo'),
      fail: 0,
      hero: twitchData.hero
    },
    kick: {
      // Los 5 generales detectados irán aquí
      drops: uniqueDrops.filter(d => d.type === 'General'),
      fail: 0,
      hero: kickData.hero
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));

  console.log(`✅ Scraping completado:`);
  console.log(`   - Exclusivos detectados (TwitchRivals/HMLMG...): ${jsonResult.twitch.drops.length}`);
  console.log(`   - Generales detectados (Box, SKS, Axe...): ${jsonResult.kick.drops.length}`);
  if (jsonResult.twitch.hero) console.log(`   - Banner detectado: ${jsonResult.twitch.hero}`);
})();
