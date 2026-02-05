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

  // Todos los drops
  const drops = await page.$$eval('div.drop-box', boxes =>
    boxes.map(b => {
      const img = b.querySelector('video source')?.src?.replace('.mp4', '.jpg') ||
                  b.querySelector('video img')?.src || '';

      const streamerLinks = [...b.querySelectorAll('a.streamer-info')]
        .map(a => {
          const name = a.querySelector('.streamer-name')?.innerText.trim() || '';
          const url = a.href || '';
          const avatar = a.querySelector('img')?.src || '';
          return { name, url, avatar };
        })
        .filter(s => s.name && s.url);

      const type = streamerLinks.length > 0 ? 'Exclusivo' : 'General';

      const name = b.querySelector('.drop-type')?.innerText || type;
      const time = b.querySelector('.drop-time span')?.innerText || '';

      return {
        id: b.querySelector('a.drop-box-body')?.href || img,
        name,
        time,
        img,
        streamers: streamerLinks,
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
    await scrape('https://twitch.facepunch.com/', 'twitch.json');
    await scrape('https://kick.facepunch.com/', 'kick.json');
  } catch (e) {
    console.error('❌ Error scraping', e);
    process.exit(1);
  }
})();
