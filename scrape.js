const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const url = process.argv[2] || 'https://twitch.facepunch.com/';
  const out = process.argv[3] || 'drops.json';

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // Usamos networkidle para asegurar que carguen las imágenes de los drops
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    // 1. Intentar capturar la imagen principal de forma segura (Opcional)
    const heroImage = await page.evaluate(() => {
      const img = document.querySelector('.hero-image img, .header-image img, .campaign-header img');
      return img ? img.src : null;
    });

    // 2. Esperar a los drops
    await page.waitForSelector('a.drop-box', { timeout: 10000 });

    // 3. Extraer los drops
    const drops = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('a.drop-box'));
      return boxes.map(box => {
        const id = box.querySelector('.drop-counter')?.dataset.itemid;
        if (!id) return null;

        // Limpiar el nombre (a veces traen espacios o saltos de línea)
        const name = box.querySelector('.drop-type')?.innerText.trim() ?? 'Rust Drop';
        const time = box.querySelector('.drop-time span')?.innerText.trim() ?? 'Unknown';
        
        // Facepunch usa videos para los drops; intentamos sacar el poster o la imagen
        const videoElement = box.querySelector('video');
        const imgElement = box.querySelector('img');
        
        let img = null;
        if (imgElement) {
          img = imgElement.src;
        } else if (videoElement) {
          // Si es video, el poster suele ser la imagen, o reemplazamos extensión
          img = videoElement.poster || videoElement.querySelector('source')?.src.replace('.mp4', '.jpg');
        }

        return { id, name, time, img };
      }).filter(d => d !== null);
    });

    fs.writeFileSync(out, JSON.stringify(drops, null, 2));
    console.log(`Éxito: Se han encontrado ${drops.length} drops.`);

  } catch (error) {
    console.error("Error detectado:", error.message);
  } finally {
    await browser.close();
  }
})();
