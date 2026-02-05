const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const platforms = [
    { name: 'twitch', url: 'https://twitch.facepunch.com/', file: 'twitch.json' },
    { name: 'kick', url: 'https://kick.facepunch.com/', file: 'kick.json' }
  ];

  for (const { name, url, file } of platforms) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
      console.log(`🌐 Scraping ${name}: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Espera extra para contenido dinámico
      await page.waitForTimeout(5000);

      // --- HERO ROBUSTO ---
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

      // --- SCROLL para lazy-load ---
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

      // --- SCRAPING DROPS ---
      const drops = await page.evaluate(() => {
        // Intentamos varios selectores comunes
        const boxes = document.querySelectorAll(
          'a.drop-box, .drop-card, .drop-container'
        );

        return [...boxes].map(box => {
          const id =
            box.querySelector('.drop-counter')?.dataset.itemid ||
            box.dataset.itemid ||
            box.getAttribute('href') ||
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

          // Streamers (Twitch/Kick)
          const streamers = [...box.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]')]
            .map(a => ({ name: a.innerText.trim(), url: a.href }))
            .filter(s => s.name && s.url);

          if (!id && !name) return null;

          return { id, name, time, img, streamers };
        }).filter(Boolean);
      });

      fs.writeFileSync(file, JSON.stringify({ hero, drops }, null, 2));
      console.log(`✅ ${name}: ${drops.length} drops guardados en ${file}`);
    } catch (err) {
      console.error(`❌ Error scraping ${name}`, err);
      process.exit(1);
    } finally {
      await browser.close();
    }
  }
})();
