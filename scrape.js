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
    console.log("🌐 Abriendo:", url);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Espera extra para JS dinámico
    await page.waitForTimeout(5000);

    // --- HERO ROBUSTO (lo que pediste) ---
    const hero = await page.evaluate(() => {
      const selectors = [
        '.hero-image img',
        '.campaign-header img',
        '.header-img img'
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el.src;
      }

      return null;
    });

    console.log("🖼 Hero:", hero || "No encontrado");

    // --- SCROLL para lazy load ---
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

    // Intentar esperar drops
    try {
      await page.waitForSelector('a.drop-box', { timeout: 15000 });
    } catch {
      console.log("⚠️ drop-box no encontrado (puede no haber campaña activa)");
    }

    // Screenshot debug útil en CI
    await page.screenshot({
      path: 'debug.png',
      fullPage: true
    });

    // --- SCRAPING DROPS ---
    const drops = await page.evaluate(() => {
      const boxes = document.querySelectorAll('a.drop-box');

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

    const result = {
      hero,
      count: drops.length,
      drops
    };

    fs.writeFileSync(out, JSON.stringify(result, null, 2));

    console.log(`✅ ${drops.length} drops encontrados`);
  }
  catch (err) {
    console.error("❌ ERROR:", err);

    try {
      await page.screenshot({
        path: 'error.png',
        fullPage: true
      });
    } catch {}
  }
  finally {
    await browser.close();
  }
})();
