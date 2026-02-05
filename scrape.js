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

  // Drops
  const drops = await page.$$eval('a.drop-box', boxes =>
    boxes.map(b => {
      const img = b.querySelector('video img')?.src ||
                  b.querySelector('video source')?.src?.replace('.mp4', '.jpg') || '';
      const streamers = [...b.querySelectorAll('a[href*="twitch.tv"], a[href*="kick.com"]')]
        .map(a => ({ name: a.innerText.trim(), url: a.href }))
        .filter(s => s.name && s.url);
      return {
        id: b.getAttribute('href') || img,
        name: b.querySelector('.drop-type')?.innerText || '',
        time: b.querySelector('.drop-time span')?.innerText || '',
        img,
        streamers
      };
    }).filter(d => d.id)
  );

  console.log(`✅ ${file.split('.')[0]}: ${drops.length} drops válidos detectados`);

  fs.writeFileSync(file, JSON.stringify({ eventImg, drops }, null, 2));
  await browser.close();
}

// Ejecución principal
(async () => {
  try {
    await scrape('https://twitch.facepunch.com/', 'twitch.json');
    await scrape('https://kick.facepunch.com/', 'kick.json');
  } catch (e) {
    console.error('❌ Error scraping', e);
    process.exit(1);
  }
})();
