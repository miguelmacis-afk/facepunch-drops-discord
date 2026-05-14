const { chromium } = require('playwright');
const fs = require('fs');

const SYSTEMS = {
  twitch: { url: 'https://twitch.facepunch.com/', platform: 'Twitch' },
  kick: { url: 'https://kick.facepunch.com/', platform: 'Kick' }
};

async function scrapePlatform(system) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log(`🌐 Scraping: ${system.url}`);
    await page.goto(system.url, { waitUntil: 'networkidle' });
    
    // Esperar a que carguen las cajas (mínimo una)
    await page.waitForSelector('.drop-box', { timeout: 10000 });

    // Capturar Hero Image
    const hero = await page.$eval('.hero-image img', img => img.src).catch(() => null);

    const drops = await page.$$eval('.drop-box', (boxes) => {
      return boxes.map(box => {
        // 1. URL: El box puede ser un <a> o contener uno
        const url = box.href || box.querySelector('a')?.href || "";
        
        // 2. Nombre del Item
        const name = box.querySelector('.drop-type')?.innerText.trim() || "Unknown Item";
        
        // 3. Tiempo
        const time = box.querySelector('.drop-time span')?.innerText.trim() || "Unknown";
        
        // 4. Imagen (Prioridad al video img de los generales)
        const img = box.querySelector('video img')?.src || box.querySelector('img')?.src || "";

        // 5. Nombre del Streamer (Si está vacío, es General)
        const streamerName = box.querySelector('.streamer-name')?.innerText.trim() || 
                             box.querySelector('.streamer-info')?.innerText.trim() || "";

        // Clasificación: Si el link es al directorio de Rust o no hay nombre de streamer -> General
        const isGeneral = url.includes('/directory/category/rust') || 
                          url.includes('/directory/game/rust') || 
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
    });

    await browser.close();
    return { drops, hero };
  } catch (err) {
    console.error(`❌ Error en ${system.platform}:`, err.message);
    await browser.close();
    return { drops: [], hero: null };
  }
}

(async () => {
  const twitchData = await scrapePlatform(SYSTEMS.twitch);
  const kickData = await scrapePlatform(SYSTEMS.kick);

  // Unificar todos los drops
  const allDrops = [...twitchData.drops, ...kickData.drops];
  
  // Eliminar duplicados usando ID (URL + Nombre)
  const uniqueDrops = Array.from(new Map(allDrops.map(d => [d.id, d])).values());

  const jsonResult = {
    twitch: {
      drops: uniqueDrops.filter(d => d.type === 'Exclusivo'),
      fail: 0,
      hero: twitchData.hero
    },
    kick: {
      // Aquí metemos todos los que no tienen streamer (SKS, Gloves, etc)
      drops: uniqueDrops.filter(d => d.type === 'General'),
      fail: 0,
      hero: kickData.hero
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));

  console.log(`✅ Finalizado:`);
  console.log(`   - Exclusivos: ${jsonResult.twitch.drops.length}`);
  console.log(`   - Generales (SKS, Axe, etc): ${jsonResult.kick.drops.length}`);
})();
