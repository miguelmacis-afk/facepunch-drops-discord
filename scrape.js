const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeRustDrops() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://twitch.facepunch.com/'); 

  const data = await page.evaluate(() => {
    const hero = document.querySelector('.hero-image img')?.src || null;
    const boxes = Array.from(document.querySelectorAll('.drop-box'));

    const drops = boxes.map(box => {
      const streamerElem = box.querySelector('.streamer-name');
      const isGeneral = !streamerElem;
      
      // Extraer URL
      const url = isGeneral ? box.href : box.querySelector('.streamer-info')?.href;
      const img = box.querySelector('video img')?.src || box.querySelector('img:not(.db-avatar img)')?.src;
      const name = box.querySelector('.drop-type')?.innerText.trim();
      const time = box.querySelector('.drop-time span')?.innerText.trim();

      return {
        id: (url + name).replace(/\s+/g, ''),
        name,
        time,
        img,
        url: url, // Guardamos la URL para filtrar después
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

  // --- LÓGICA DE FILTRADO CORREGIDA ---
  const result = {
    twitch: {
      // Solo si la URL incluye twitch o es un Drop Exclusivo de Twitch
      drops: data.drops.filter(d => d.url.includes('twitch.tv') && d.type === 'Exclusivo'),
      fail: 0,
      hero: data.hero
    },
    kick: {
      // Solo si la URL incluye kick.com
      drops: data.drops.filter(d => d.url.includes('kick.com')),
      fail: 0,
      hero: null
    },
    general: {
      // Drops generales (suelen ser de Twitch pero se marcan aparte para el monitor)
      drops: data.drops.filter(d => d.type === 'General'),
      fail: 0,
      hero: null
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(result, null, 2));
  await browser.close();
  
  return result;
}

scrapeRustDrops().then(res => {
  console.log(`✅ Scraping completado.`);
  console.log(`- Twitch detectados: ${res.twitch.drops.length}`);
  console.log(`- Kick detectados: ${res.kick.drops.length}`);
  console.log(`- Generales detectados: ${res.general.drops.length}`);
});
