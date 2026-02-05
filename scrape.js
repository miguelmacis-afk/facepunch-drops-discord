const { chromium } = require('playwright');
const fs = require('fs');

async function scrape(url, file) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Hero image del evento
  let eventImg = null;
  try {
    eventImg = await page.$eval('.hero-image img', el => el.src);
  } catch (e) {
    console.log("🖼 Hero image no encontrado");
  }

  // Seleccionar todos los drops, incluidos los generales
  const drops = await page.$$eval('div.drop-box', boxes =>
    boxes.map(b => {
      const img =
        b.querySelector('video img')?.src ||
        b.querySelector('video source')?.src?.replace('.mp4', '.jpg') ||
        '';

      const name = b.querySelector('.drop-type')?.innerText.trim() || '';
      const time = b.querySelector('.drop-time span')?.innerText.trim() || '';

      // Streamers si existen
      const streamers = [...b.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]')]
        .map(a => ({
          name: a.innerText.trim(),
          url: a.href,
          avatar: a.querySelector('img')?.src || ''
        }))
        .filter(s => s.name && s.url);

      // Identificador único
      const id = b.querySelector('a.drop-box-body')?.href || img || name;

      return {
        id,
        name,
        time,
        img: img || null,
        streamers,
        type: streamers.length > 0 ? "Exclusivo" : "General"
      };
    })
  );

  fs.writeFileSync(file, JSON.stringify({ drops, eventImg }, null, 2));
  console.log(`✅ ${file.replace('.json','')} detectados: ${drops.length}`);
  await browser.close();
}

(async () => {
  await scrape('https://twitch.facepunch.com/', 'twitch.json');
  await scrape('https://kick.facepunch.com/', 'kick.json');
})();
