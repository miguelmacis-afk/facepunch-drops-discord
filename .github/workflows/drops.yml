const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const url = process.argv[2] || 'https://twitch.facepunch.com/';
  const out = process.argv[3] || 'drops.json';

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 }
  });

  try {
    console.log("🌐 Abriendo página...");
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Espera extra para scripts dinámicos
    await page.waitForTimeout(5000);

    console.log("🔎 Buscando drops...");

    // Scroll progresivo real (lazy loading)
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let total = 0;
        const distance = 500;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          total += distance;

          if (total >= 6000) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });

    // Esperar si existen drops
    try {
      await page.waitForSelector('a.drop-box', { timeout: 15000 });
    } catch {
      console.log("⚠️ No se encontró selector drop-box");
    }

    // Screenshot debug (clave en CI)
    await page.screenshot({ path: 'debug.png', fullPage: true });

    const drops = await page.evaluate(() => {
      const boxes = document.querySelectorAll('a.drop-box');

      if (!boxes.length) {
        console.log("No drop-box found in DOM");
      }

      return [...boxes].map(box => {
        const id =
          box.querySelector('.drop-counter')?.dataset.itemid ||
          box.dataset.itemid ||
          null;

        const name =
          box.querySelector('.drop-type')?.innerText.trim() ||
          box.querySelector('h3')?.innerText.trim() ||
          "Rust Drop";

        const time =
          box.querySelector('.drop-time span')?.innerText.trim() ||
          box.innerText.match(/\d+\s*(h|hour|min)/i)?.[0] ||
          "Unknown";

        const img =
          box.querySelector('img')?.src ||
          box.querySelector('video')?.poster ||
          null;

        if (!id && !name) return null;

        return { id, name, time, img };
      }).filter(Boolean);
    });

    fs.writeFileSync(out, JSON.stringify(drops, null, 2));

    console.log(`✅ Scrape completado: ${drops.length} drops encontrados.`);
  }
  catch (err) {
    console.error("❌ ERROR:", err);

    // Screenshot en error
    try {
      await page.screenshot({ path: 'error.png', fullPage: true });
    } catch {}
  }
  finally {
    await browser.close();
  }
})();
