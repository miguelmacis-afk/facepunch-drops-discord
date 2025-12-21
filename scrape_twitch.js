const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://twitch.facepunch.com/');
  await page.waitForLoadState('networkidle');

  const imgs = await page.$$eval('img', imgs => imgs.map(i => i.src)
    .filter(src => /\.(jpg|jpeg|png|svg)$/i.test(src) && !/logo|icon|banner|avatar|favicon/i.test(src))
  );

  fs.writeFileSync('twitch_imgs.txt', imgs.join('\n'));
  await browser.close();
})();
