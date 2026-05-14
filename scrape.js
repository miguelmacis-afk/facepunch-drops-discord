const { chromium } = require('playwright');
const fs = require('fs');

const SYSTEMS = {
  twitch: { url: 'https://twitch.facepunch.com/', key: 'twitch' },
  kick: { url: 'https://kick.facepunch.com/', key: 'kick' }
};

async function scrapePlatform(systemConfig) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`🔎 Explorando: ${systemConfig.url}`);
    await page.goto(systemConfig.url, { waitUntil: 'networkidle', timeout: 60000 });

    // 1. Esperar a que las cajas de drops existan (mínimo 5)
    await page.waitForSelector('.drop-box', { timeout: 20000 });
    
    // 2. Scroll suave para asegurar que las imágenes y datos se carguen
    await page.evaluate(async () => {
      window.scrollBy(0, 1000);
      await new Promise(r => setTimeout(r, 1000));
      window.scrollBy(0, -1000);
    });

    const hero = await page.$eval('.hero-image img', img => img.src).catch(() => null);

    // 3. Extracción robusta
    const drops = await page.$$eval('.drop-box', (boxes) => {
      return boxes.map(box => {
        // Obtenemos el nombre del objeto (Ej: SKS, Large Wood Box)
        const name = box.querySelector('.drop-type, .name, h3')?.innerText.trim() || "Unknown Item";
        
        // Obtenemos el streamer si existe (en generales suele ser el texto del bloque o nada)
        const streamerInfo = box.querySelector('.streamer-name, .streamer-info')?.innerText.trim() || "";
        
        // El link: si el box no es un <a>, buscamos el primer <a> dentro
        const url = box.href || box.querySelector('a')?.href || "";
        
        const time = box.querySelector('.drop-time, .time')?.innerText.trim() || "0 Hours";
        
        // Imagen con fallback
        const img = box.querySelector('img.drop-img, video img, img')?.src || "";

        // Lógica de clasificación:
        // Si el link va al directorio general de Rust o no hay nombre de streamer -> GENERAL
        const isGeneral = url.toLowerCase().includes('directory') || streamerInfo === "";

        return {
          id: url + name,
          name,
          time: time.replace(/\n/g, ' '), // Limpiar saltos de línea
          img,
          streamers: isGeneral ? [] : [{
            name: streamerInfo,
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
    console.error(`❌ Error en ${systemConfig.key}:`, err.message);
    await browser.close();
    return { drops: [], hero: null };
  }
}

(async () => {
  const twitchData = await scrapePlatform(SYSTEMS.twitch);
  const kickData = await scrapePlatform(SYSTEMS.kick);

  // Unificamos todo
  const allDrops = [...twitchData.drops, ...kickData.drops];
  
  // Eliminamos duplicados por ID (URL + Nombre)
  const uniqueMap = new Map();
  allDrops.forEach(d => {
    if (!uniqueMap.has(d.id)) uniqueMap.set(d.id, d);
  });
  const uniqueDrops = Array.from(uniqueMap.values());

  const jsonResult = {
    twitch: {
      drops: uniqueDrops.filter(d => d.type === 'Exclusivo'),
      fail: 0,
      hero: twitchData.hero
    },
    kick: {
      // Metemos aquí los generales: SKS, Axe, Gloves, etc.
      drops: uniqueDrops.filter(d => d.type === 'General'),
      fail: 0,
      hero: kickData.hero
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));

  console.log(`\n✅ RESULTADOS FINALES:`);
  console.log(`   - [EXCLUSIVOS]: ${jsonResult.twitch.drops.length}`);
  console.log(`   - [GENERALES]: ${jsonResult.kick.drops.length}`);
  
  if (jsonResult.kick.drops.length > 0) {
    console.log(`   - Items generales encontrados: ${jsonResult.kick.drops.map(d => d.name).join(', ')}`);
  } else {
    console.warn("   ⚠️ No se encontraron generales. Revisa si la web ha cambiado el selector '.drop-box'");
  }
})();
