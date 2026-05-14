const { chromium } = require('playwright');
const fs = require('fs');

const SYSTEMS = {
  twitch: {
    url: 'https://twitch.facepunch.com/',
    container: '.drop-box',
    // Twitch usa .streamer-name para exclusivos y .streamer-info para el bloque
    streamerName: '.streamer-name, .streamer-info span', 
    itemName: '.drop-type',
    time: '.drop-time span',
    image: 'video img, img.drop-img, img',
    // Link general de la categoría para identificar drops generales
    generalDir: '/directory/category/rust'
  },
  kick: {
    url: 'https://kick.facepunch.com/',
    container: '.drop-box',
    streamerName: '.streamer-info span', 
    itemName: '.drop-type',
    time: '.drop-time span',
    image: 'video img, img.drop-img, img',
    generalDir: '/directory/category/rust'
  }
};

async function scrapePlatform(systemKey) {
  const config = SYSTEMS[systemKey];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`🌐 Scraping ${systemKey.toUpperCase()}...`);
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
    
    await page.waitForSelector(config.container, { timeout: 10000 }).catch(() => null);

    // Capturar Hero Image de la plataforma
    const hero = await page.$eval('.hero-image img', img => img.src).catch(() => null);

    const drops = await page.$$eval(config.container, (boxes, cfg) => {
      return boxes.map(box => {
        // 1. Buscar el nombre del streamer (en varios posibles selectores)
        const streamerName = box.querySelector(cfg.streamerName)?.innerText.trim() || "";
        
        // 2. Buscar el enlace (si el box no es <a>, buscamos el primer <a> interno)
        const url = box.href || box.querySelector('a')?.href || "";
        
        const name = box.querySelector(cfg.itemName)?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector(cfg.time)?.innerText.trim() || 'Unknown';
        const img = box.querySelector(cfg.image)?.src || "";

        // LÓGICA DE CLASIFICACIÓN
        // Es general si: no hay nombre de streamer O el link apunta al directorio general de Rust
        const isGeneral = streamerName === "" || url.includes(cfg.generalDir);

        return {
          id: url + name, // ID único para evitar duplicados entre webs
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
    }, config);

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

  // Mezclamos todos los drops de ambas fuentes
  const allData = [...twitchData.drops, ...kickData.drops];
  
  // Eliminamos duplicados (importante para los General Drops que se repiten)
  const uniqueDrops = Array.from(new Map(allData.map(d => [d.id, d])).values());

  const jsonResult = {
    twitch: {
      drops: uniqueDrops.filter(d => d.type === 'Exclusivo'),
      fail: 0,
      hero: twitchData.hero
    },
    kick: {
      // Todos los generales se guardan aquí independientemente de donde vengan
      drops: uniqueDrops.filter(d => d.type === 'General'),
      fail: 0,
      hero: kickData.hero
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));

  console.log(`✅ Proceso finalizado:`);
  console.log(`   - Exclusivos: ${jsonResult.twitch.drops.length}`);
  console.log(`   - Generales: ${jsonResult.kick.drops.length}`);
  if (jsonResult.twitch.hero) console.log(`   - Hero detectado: ${jsonResult.twitch.hero}`);
})();
