const fs = require('fs');
const { chromium } = require('playwright');

async function scrape(url, file) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log(`🌐 Scraping: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Hero image
  const eventImg = await page.$eval('.hero-image img', el => el.src).catch(() => '');
  console.log(`🖼 Hero image: ${eventImg || 'No encontrado'}`);

  // Selecciona todos los drops: generales y exclusivos
  const drops = await page.$$eval('a.drop-box, a.drop-exclusive', boxes =>
    boxes.map(b => {
      const img = b.querySelector('video img')?.src ||
                  b.querySelector('video source')?.src?.replace('.mp4', '.jpg') || '';

      const streamers = [...b.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]')]
        .map(a => ({ name: a.innerText.trim(), url: a.href }))
        .filter(s => s.name && s.url);

      const type = streamers.length > 0 ? 'Exclusivo' : 'General';

      return {
        id: b.getAttribute('href') || img,
        name: b.querySelector('.drop-type')?.innerText || type,
        time: b.querySelector('.drop-time span')?.innerText || '',
        img,
        streamers,
        type
      };
    })
  );

  console.log(`✅ ${file.split('.')[0]}: ${drops.length} drops detectados`);

  fs.writeFileSync(file, JSON.stringify({ eventImg, drops }, null, 2));
  await browser.close();
}

(async () => {
  try {
    // Twitch
    await scrape('https://twitch.facepunch.com/', 'twitch.json');
    // Kick
    await scrape('https://kick.facepunch.com/', 'kick.json');
  } catch (e) {
    console.error('❌ Error scraping', e);
    process.exit(1);
  }
})();
