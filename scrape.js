const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const stateFile = 'state.json';

  // Carga state.json actual o crea uno nuevo
  let state = { twitch: { drops: [], fail: 0 }, kick: { drops: [], fail: 0 } };
  if (fs.existsSync(stateFile)) {
    try {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch {}
  }

  const platforms = [
    { name: 'twitch', url: 'https://twitch.facepunch.com/' },
    { name: 'kick', url: 'https://kick.facepunch.com/' }
  ];

  for (const { name, url } of platforms) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
      console.log(`🌐 Scraping ${name}: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Espera inicial para React
      await page.waitForTimeout(7000);

      // HERO
      const hero = await page.evaluate(() => {
        const selectors = ['.hero-image img', '.campaign-header img', '.header-img img'];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return el.src;
        }
        return null;
      });
      console.log(`🖼 Hero ${name}:`, hero || "No encontrado");

      // Scroll infinito dinámico para cargar todos los drops
      await page.evaluate(async () => {
        let prevHeight = 0;
        let sameCount = 0;
        while (sameCount < 3) {
          window.scrollBy(0, 1000);
          await new Promise(r => setTimeout(r, 500));
          const scrollHeight = document.body.scrollHeight;
          if (scrollHeight === prevHeight) sameCount++;
          else sameCount = 0;
          prevHeight = scrollHeight;
        }
      });

      await page.waitForTimeout(2000);

      // Scrape de drops
      let drops = await page.evaluate(() => {
        const boxes = document.querySelectorAll('a.drop-box, .drop-card, .drop-container, [class*="drop"]');

        const seen = new Set();

        return [...boxes].map(box => {
          const id =
            box.querySelector('.drop-counter')?.dataset.itemid ||
            box.dataset.itemid ||
            box.getAttribute('href') ||
            null;

          const name =
            box.querySelector('.drop-type')?.innerText.trim() ||
            box.querySelector('h3')?.innerText.trim() ||
            null;

          const time =
            box.querySelector('.drop-time span')?.innerText.trim() ||
            box.innerText.match(/\d+\s*(h|hour|min)/i)?.[0] ||
            null;

          const img =
            box.querySelector('img')?.src ||
            box.querySelector('video')?.poster ||
            box.querySelector('figure img')?.src ||
            null;

          const streamers = [...box.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]')]
            .map(a => ({ name: a.innerText.trim(), url: a.href }))
            .filter(s => s.name && s.url);

          // Filtrado de drops inválidos o repetidos
          if (!id || !name || seen.has(id)) return null;
          seen.add(id);

          return { id, name, time: time || "Unknown", img, streamers };
        }).filter(Boolean);
      });

      console.log(`✅ ${name}: ${drops.length} drops válidos detectados`);

      // Actualizar state.json
      state[name] = { drops, fail: 0, hero };
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

    } catch (err) {
      console.error(`❌ Error scraping ${name}`, err);
      // Marcar fallo en state.json
      state[name].fail = 1;
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
      process.exit(1);
    } finally {
      await browser.close();
    }
  }
})();
