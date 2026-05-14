const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeRustDrops() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://twitch.facepunch.com/'); 

  const data = await page.evaluate(() => {
    const hero = document.querySelector('.hero-image img')?.src || null;
    
    // Buscamos todas las secciones de campaña para detectar alertas de tiempo
    const campaignSections = Array.from(document.querySelectorAll('.section.drops.campaign'));
    let allDrops = [];

    campaignSections.forEach(section => {
      // Detectar si esta sección tiene un mensaje de disponibilidad limitada
      const alertElem = section.querySelector('.subtitle.alert');
      const availability = alertElem ? alertElem.innerText.trim() : null;

      const boxes = Array.from(section.querySelectorAll('.drop-box'));

      boxes.forEach(box => {
        const streamerElem = box.querySelector('.streamer-name');
        const isGeneral = !streamerElem;
        
        // Extraer URL: Priorizar el link del cuerpo del drop o el del streamer
        const urlElem = box.querySelector('a.drop-box-body') || box.querySelector('.streamer-info');
        const url = urlElem ? urlElem.href : (isGeneral ? "#" : "");

        // Captura de imagen: Maneja <img> normal y <img> dentro de <video>
        const img = box.querySelector('video img')?.src || 
                    box.querySelector('video')?.poster ||
                    box.querySelector('img:not(.db-avatar img)')?.src;

        const name = box.querySelector('.drop-type')?.innerText.trim();
        const time = box.querySelector('.drop-time span')?.innerText.trim();

        allDrops.push({
          id: (url + name).replace(/\s+/g, ''),
          name,
          time,
          img,
          url,
          availability, // Nuevo campo: "Only available May 13th..."
          type: isGeneral ? 'General' : 'Exclusivo',
          streamers: isGeneral ? [] : [{
            name: streamerElem.innerText.trim(),
            url: url,
            avatar: box.querySelector('.db-avatar img')?.src || ""
          }]
        });
      });
    });

    return { drops: allDrops, hero };
  });

  // --- LÓGICA DE CLASIFICACIÓN ---
  const result = {
    twitch: {
      // Exclusivos que NO son de Kick
      drops: data.drops.filter(d => d.type === 'Exclusivo' && !d.url.includes('kick.com')),
      fail: 0,
      hero: data.hero
    },
    kick: {
      // Cualquier drop que tenga link de Kick
      drops: data.drops.filter(d => d.url.includes('kick.com')),
      fail: 0,
      hero: null
    },
    general: {
      // Drops marcados como generales en la web
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
}).catch(err => {
  console.error("❌ Error en el scraping:", err);
  process.exit(1);
});
