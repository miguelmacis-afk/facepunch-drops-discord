const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const url = process.argv[2] || 'https://twitch.facepunch.com/';
  const out = process.argv[3] || 'drops.json';

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // Usamos networkidle para esperar a que carguen las imágenes y scripts
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    // --- ELIMINAMOS EL ERROR DEL HERO ---
    // En lugar de $eval, usamos evaluate para que si no existe, devuelva null sin romper el script
    const heroData = await page.evaluate(() => {
      const img = document.querySelector('.hero-image img, .campaign-header img, .header-img');
      return img ? img.src : null;
    });

    await page.waitForSelector('a.drop-box', { timeout: 15000 });

    // Scroll para asegurar que los elementos lazy-load aparezcan
    await page.evaluate(async () => {
      window.scrollBy(0, 1000);
      await new Promise(r => setTimeout(r, 500));
    });

    const drops = await page.evaluate(() => {
      return [...document.querySelectorAll('a.drop-box')].map(box => {
        const id = box.querySelector('.drop-counter')?.dataset.itemid;
        if (!id) return null;

        // Facepunch a veces usa <img> y otras <video poster="...">
        const imageElement = box.querySelector('img');
        const videoElement = box.querySelector('video');

        return {
          id: id,
          name: box.querySelector('.drop-type')?.innerText.trim() ?? 'Rust Drop',
          time: box.querySelector('.drop-time span')?.innerText.trim() ?? 'Unknown',
          img: imageElement ? imageElement.src : (videoElement ? videoElement.poster : null)
        };
      }).filter(d => d !== null);
    });

    fs.writeFileSync(out, JSON.stringify(drops, null, 2));
    console.log(`✅ Scrape completado: ${drops.length} drops encontrados.`);

  } catch (err) {
    
  } finally {
    await browser.close();
  }
})();
