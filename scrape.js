const { chromium } = require('playwright');
const fs = require('fs');

async function scrape(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`🌐 Scraping: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    // Esperar a que cargue el contenedor principal
    await page.waitForSelector('.drop-box');

    const drops = await page.$$eval('.drop-box', (boxes) => {
      return boxes.map(box => {
        // 1. Extraer nombre del streamer (si existe)
        const streamerName = box.querySelector('.streamer-info')?.innerText.trim() || "";
        
        // 2. Extraer nombre del objeto (ej: "Large Wood Box")
        const name = box.querySelector('.drop-type')?.innerText.trim() || 'Unknown Drop';
        
        // 3. Extraer tiempo (ej: "1 Hour")
        const time = box.querySelector('.drop-time span')?.innerText.trim() || 'Unknown';
        
        // 4. Extraer imagen (priorizando el poster del video)
        const img = box.querySelector('video img')?.src || 
                    box.querySelector('img')?.src || "";
        
        const urlLink = box.href || "";

        // LÓGICA DE DETECCIÓN:
        // Es general si el nombre del streamer está vacío o el link es el directorio general de Rust
        const isGeneral = streamerName === "" || urlLink.includes('/directory/category/rust');

        const streamers = [];
        if (!isGeneral) {
          streamers.push({
            name: streamerName,
            url: urlLink,
            avatar: "" // El avatar suele estar en otro lugar, pero aquí lo dejamos limpio
          });
        }

        return {
          id: urlLink + name, // ID compuesto para evitar duplicados
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

  // Combinar y limpiar duplicados
  const allDrops = [...twitchData, ...kickData];
  const uniqueDrops = Array.from(new Map(allDrops.map(d => [d.id, d])).values());

  const jsonResult = {
    twitch: {
      drops: uniqueDrops.filter(d => d.type === 'Exclusivo'),
      fail: 0,
      hero: null
    },
    kick: {
      // Guardamos aquí los generales (siguiendo tu estructura)
      drops: uniqueDrops.filter(d => d.type === 'General'),
      fail: 0,
      hero: null
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));
  
  console.log(`✅ Scraping completado:`);
  console.log(`   - Exclusivos detectados: ${jsonResult.twitch.drops.length}`);
  console.log(`   - Generales detectados: ${jsonResult.kick.drops.length}`);
})();
