const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeRustDrops() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Usamos el HTML que proporcionaste (o la URL real)
  await page.goto('https://twitch.facepunch.com/'); 

  const data = await page.evaluate(() => {
    const hero = document.querySelector('.hero-image img')?.src || null;
    const boxes = Array.from(document.querySelectorAll('.drop-box'));

    const drops = boxes.map(box => {
      // 1. Detectar si es General o Streamer por la estructura interna
      const streamerElem = box.querySelector('.streamer-name');
      const isGeneral = !streamerElem;

      // 2. Extraer URL (En General es el box mismo, en Streamer es el link interno)
      const url = isGeneral ? box.href : box.querySelector('.streamer-info')?.href;

      // 3. Extraer Imagen (Prioridad al fallback de video)
      const img = box.querySelector('video img')?.src || box.querySelector('img:not(.db-avatar img)')?.src;

      // 4. Nombre del item y tiempo
      const name = box.querySelector('.drop-type')?.innerText.trim();
      const time = box.querySelector('.drop-time span')?.innerText.trim();

      return {
        id: url + name,
        name,
        time,
        img,
        type: isGeneral ? 'General' : 'Exclusivo',
        streamers: isGeneral ? [] : [{
          name: streamerElem.innerText.trim(),
          url: url,
          avatar: box.querySelector('.db-avatar img')?.src || ""
        }]
      };
    });

    return { drops, hero };
  });

  const result = {
    twitch: {
      drops: data.drops.filter(d => d.type === 'Exclusivo'),
      hero: data.hero
    },
    general: {
      drops: data.drops.filter(d => d.type === 'General')
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(result, null, 2));
  await browser.close();
  
  return result;
}

scrapeRustDrops().then(res => {
  console.log(`✅ Scraping completado.`);
  console.log(`- Generales detectados: ${res.general.drops.length}`);
  console.log(`- Exclusivos detectados: ${res.twitch.drops.length}`);
});
