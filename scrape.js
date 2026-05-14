const { chromium } = require('playwright');
const fs = require('fs');

// 1. Definición de selectores por sistema
const SYSTEMS = {
  twitch: {
    url: 'https://twitch.facepunch.com/',
    container: '.drop-box',
    streamerName: '.streamer-info span', // Donde aparece el nombre del streamer
    itemName: '.drop-type',
    time: '.drop-time span',
    image: 'video img, img.drop-img, img',
    platformLink: 'twitch.tv'
  },
  kick: {
    url: 'https://kick.facepunch.com/',
    container: '.drop-box',
    streamerName: '.streamer-info span', 
    itemName: '.drop-type',
    time: '.drop-time span',
    image: 'video img, img.drop-img, img',
    platformLink: 'kick.com'
  }
};

async function scrapePlatform(systemKey) {
  const config = SYSTEMS[systemKey];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`🌐 Iniciando scraping sistema: ${systemKey.toUpperCase()}`);
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Esperar a que el contenedor principal esté presente
    await page.waitForSelector(config.container, { timeout: 10000 }).catch(() => null);

    const drops = await page.$$eval(config.container, (boxes, cfg) => {
      return boxes.map(box => {
        const streamerNameRaw = box.querySelector(cfg.streamerName)?.innerText.trim() || "";
        const name = box.querySelector(cfg.itemName)?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector(cfg.time)?.innerText.trim() || 'Unknown';
        const img = box.querySelector(cfg.image)?.src || "";
        const url = box.href || "";

        // Clasificación lógica por sistema
        // Es general si no hay nombre de streamer o el link no contiene la plataforma específica
        const isGeneral = streamerNameRaw === "" || !url.toLowerCase().includes(cfg.platformLink);

        return {
          id: url + name,
          name,
          time,
          img,
          streamers: isGeneral ? [] : [{
            name: streamerNameRaw,
            url: url,
            avatar: ""
          }],
          type: isGeneral ? 'General' : 'Exclusivo'
        };
      });
    }, config);

    return drops;
  } catch (err) {
    console.error(`❌ Error en sistema ${systemKey}:`, err.message);
    return [];
  } finally {
    await browser.close();
  }
}

(async () => {
  // Ejecutamos ambos sistemas
  const twitchResults = await scrapePlatform('twitch');
  const kickResults = await scrapePlatform('kick');

  // Consolidamos todos los datos detectados
  const allData = [...twitchResults, ...kickResults];
  
  // Eliminamos duplicados reales (usando ID)
  const uniqueDrops = Array.from(new Map(allData.map(d => [d.id, d])).values());

  // Construimos el JSON final con tu estructura requerida
  const jsonResult = {
    twitch: {
      drops: uniqueDrops.filter(d => d.type === 'Exclusivo'),
      fail: 0,
      hero: null
    },
    kick: {
      // Aquí agrupamos todos los generales de ambas plataformas
      drops: uniqueDrops.filter(d => d.type === 'General'),
      fail: 0,
      hero: null
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));

  console.log(`✅ Proceso finalizado:`);
  console.log(`   - [SISTEMA TWITCH] detectó ${twitchResults.length} elementos`);
  console.log(`   - [SISTEMA KICK] detectó ${kickResults.length} elementos`);
  console.log(`   - [TOTAL FINAL] ${jsonResult.twitch.drops.length} Exclusivos, ${jsonResult.kick.drops.length} Generales`);
})();
