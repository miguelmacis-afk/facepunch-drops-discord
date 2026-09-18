const { chromium } = require('playwright');
const fs = require('fs');

// Obtener la URL del Webhook desde las variables de entorno de Node.js / GitHub Actions
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

/**
 * Función auxiliar para traducir textos comunes de los drops al español
 */
function translateText(text) {
  if (!text) return '';
  let translated = text;

  translated = translated.replace(/General Drop/gi, 'Drop General');
  translated = translated.replace(/Streamer Drop/gi, 'Drop de Streamer');
  translated = translated.replace(/Exclusive/gi, 'Exclusivo');
  translated = translated.replace(/Watch for/gi, 'Ver durante');
  translated = translated.replace(/hours?/gi, 'horas');
  translated = translated.replace(/minutes?/gi, 'minutos');
  translated = translated.replace(/mins?/gi, 'mins');
  translated = translated.replace(/1 horas/gi, '1 hora');

  return translated.trim();
}

/**
 * Traduce el formato de fecha del evento al español
 */
function translateEventTime(timeStr) {
  if (!timeStr) return '';
  return timeStr
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1') // Convierte '24th' en '24'
    .replace(/January/gi, 'enero')
    .replace(/February/gi, 'febrero')
    .replace(/March/gi, 'marzo')
    .replace(/April/gi, 'abril')
    .replace(/May/gi, 'mayo')
    .replace(/June/gi, 'junio')
    .replace(/July/gi, 'julio')
    .replace(/August/gi, 'agosto')
    .replace(/September/gi, 'septiembre')
    .replace(/October/gi, 'octubre')
    .replace(/November/gi, 'noviembre')
    .replace(/December/gi, 'diciembre')
    .replace(/\bat\b/gi, 'a las')
    .replace(/\bto\b/gi, 'al')
    .trim();
}

/**
 * Extrae la información general del evento (Embed / Header)
 */
async function scrapeEventEmbed(page, defaultUrl) {
  return await page.evaluate((url) => {
    // 1. Obtener Título
    const titleEl = document.querySelector(
      '.campaign-title, header h1, .event-title, .header-title, .hero h1, h1'
    );

    // 2. Obtener Fechas con selectores múltiples y fallback dinámico
    const timeSelectors = [
      '.dates',
      '.campaign-dates',
      '.event-dates',
      '.header-dates',
      '.dates-container',
      '.schedule',
      'header .subtitle',
      '.campaign-subtitle',
      'header p'
    ];
    
    let timeText = '';
    for (const sel of timeSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) {
        timeText = el.innerText.trim();
        break;
      }
    }

    // Fallback: Buscar cualquier elemento dentro del header que contenga un mes en inglés
    if (!timeText) {
      const monthsRegex = /(january|february|march|april|may|june|july|august|september|october|november|december)/i;
      const allHeaderNodes = Array.from(document.querySelectorAll('header *, .campaign-header *, .hero *'));
      const found = allHeaderNodes.find(el => monthsRegex.test(el.innerText) && el.children.length === 0);
      if (found) {
        timeText = found.innerText.trim();
      }
    }

    // 3. Obtener Imagen del evento (etiqueta <img> o CSS background-image)
    let imgEl = document.querySelector(
      '.campaign-header img, header img, .header-banner img, .hero img, .event-logo img, img[src*="files.facepunch.com"], img[src*="cdn.facepunch.com"], img.logo, .logo img'
    );
    let imageUrl = imgEl ? imgEl.src : '';

    if (!imageUrl) {
      const bgContainers = document.querySelectorAll('header, .campaign-header, .hero, .header-banner, .banner');
      for (const bgEl of bgContainers) {
        const bg = window.getComputedStyle(bgEl).backgroundImage;
        if (bg && bg !== 'none') {
          const match = bg.match(/url\(["']?(.*?)["']?\)/);
          if (match && match[1]) {
            imageUrl = match[1];
            break;
          }
        }
      }
    }

    return {
      title: titleEl ? titleEl.innerText.trim() : 'Rust Drops',
      url: url,
      image: imageUrl,
      time: timeText
    };
  }, defaultUrl);
}
/**
 * Scraper para Twitch Drops
 */
async function scrapeTwitch() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('🔍 Extrayendo información de Twitch Drops...');
    await page.goto('https://twitch.facepunch.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.drop-box', { timeout: 15000 });

    const embed = await scrapeEventEmbed(page, 'https://twitch.facepunch.com/');

    const drops = await page.$$eval('.drop-box', boxes => {
      return boxes.map(box => {
        const streamerNameRaw = box.querySelector('.streamer-name, .streamer-info span, .streamer-title')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type, .drop-name')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span, .drop-time')?.innerText.trim() || 'Unknown';

        const img = box.querySelector('video img')?.src
          || box.querySelector('video source')?.src?.replace('.mp4', '.jpg')
          || box.querySelector('img.drop-image, img')?.src || '';

        const isGeneral = streamerNameRaw.toLowerCase().includes('general drop') || streamerNameRaw === '';

        const streamers = [];
        box.querySelectorAll('a[href*="twitch.tv"]').forEach(a => {
          const streamerName = a.innerText.trim() || streamerNameRaw || 'Streamer';
          streamers.push({
            name: streamerName,
            url: a.href,
            avatar: a.querySelector('img')?.src || ''
          });
        });

        const dropLink = box.querySelector('a')?.href || '';
        const id = dropLink || img || name;
        const type = isGeneral || streamers.length === 0 ? 'General' : 'Exclusivo';

        return { id, name, time, img, streamers, type };
      });
    });

    const translatedDrops = drops.map(drop => ({
      ...drop,
      name_es: translateText(drop.name),
      time_es: translateText(drop.time),
      type_es: translateText(drop.type)
    }));

    return { embed, drops: translatedDrops };

  } catch (err) {
    console.error('❌ Error scraping Twitch:', err);
    return { embed: null, drops: [] };
  } finally {
    await browser.close();
  }
}

/**
 * Scraper para Kick Drops
 */
async function scrapeKick() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('🔍 Extrayendo información de Kick Drops...');
    await page.goto('https://kick.facepunch.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.drop-box', { timeout: 15000 });

    const embed = await scrapeEventEmbed(page, 'https://kick.facepunch.com/');

    const drops = await page.$$eval('.drop-box', boxes => {
      return boxes.map(box => {
        const streamerNameRaw = box.querySelector('.streamer-name, .streamer-info span, .streamer-title')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type, .drop-name')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span, .drop-time')?.innerText.trim() || 'Unknown';

        const img = box.querySelector('video img')?.src
          || box.querySelector('video source')?.src?.replace('.mp4', '.jpg')
          || box.querySelector('img.drop-image, img')?.src || '';

        const isGeneral = streamerNameRaw.toLowerCase().includes('general drop') || streamerNameRaw === '';

        const streamers = [];
        box.querySelectorAll('a[href*="kick.com"]').forEach(a => {
          const streamerName = a.innerText.trim() || streamerNameRaw || 'Streamer';
          streamers.push({
            name: streamerName,
            url: a.href,
            avatar: a.querySelector('img')?.src || ''
          });
        });

        const dropLink = box.querySelector('a')?.href || '';
        const id = dropLink || img || name;
        const type = isGeneral || streamers.length === 0 ? 'General' : 'Exclusivo';

        return { id, name, time, img, streamers, type };
      });
    });

    const translatedDrops = drops.map(drop => ({
      ...drop,
      name_es: translateText(drop.name),
      time_es: translateText(drop.time),
      type_es: translateText(drop.type)
    }));

    return { embed, drops: translatedDrops };

  } catch (err) {
    console.error('❌ Error scraping Kick:', err);
    return { embed: null, drops: [] };
  } finally {
    await browser.close();
  }
}

/**
 * Envía el mensaje con el Embed del evento a Discord
 */
async function sendDiscordEventEmbed(embedData) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('⚠️ No se ha detectado la variable de entorno DISCORD_WEBHOOK.');
    return;
  }

  const discordPayload = {
    embeds: [
      {
        title: embedData.title,
        url: embedData.url,
        description: `📅 **Fechas del evento:**\n${embedData.time_es || embedData.time || 'Fecha no disponible'}`,
        color: 13517355, // Naranja Rust
        image: embedData.image ? { url: embedData.image } : undefined,
        footer: {
          text: 'Rust Facepunch Drops Event'
        }
      }
    ]
  };

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    });

    if (response.ok) {
      console.log('🚀 Embed del evento enviado con éxito a Discord.');
    } else {
      console.error(`❌ Error al enviar el Embed a Discord: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('❌ Error enviando mensaje a Discord:', error);
  }
}

// Ejecución principal
(async () => {
  const twitchData = await scrapeTwitch();
  const kickData = await scrapeKick();

  const embedHeader = twitchData.embed || kickData.embed || {
    title: 'Rust Drops',
    url: 'https://twitch.facepunch.com/',
    image: '',
    time: ''
  };

  const jsonResult = {
    embed: {
      title: embedHeader.title,
      url: 'https://twitch.facepunch.com/',
      image: embedHeader.image,
      time: embedHeader.time,
      time_es: translateEventTime(embedHeader.time)
    },
    twitch: {
      exclusive: twitchData.drops.filter(d => d.type === 'Exclusivo'),
      general: twitchData.drops.filter(d => d.type === 'General'),
      drops: twitchData.drops,
      fail: twitchData.drops.length === 0 ? 1 : 0,
      hero: twitchData.embed
    },
    kick: {
      exclusive: kickData.drops.filter(d => d.type === 'Exclusivo'),
      general: kickData.drops.filter(d => d.type === 'General'),
      drops: kickData.drops,
      fail: kickData.drops.length === 0 ? 1 : 0,
      hero: kickData.embed
    }
  };

  fs.writeFileSync('drops.json', JSON.stringify(jsonResult, null, 2));

  // ENVIAR EMBED PRINCIPAL DEL EVENTO A DISCORD
  await sendDiscordEventEmbed(jsonResult.embed);

  console.log(`\n✅ Scraping completado con éxito:`);
  console.log(`📌 Título: ${jsonResult.embed.title}`);
  console.log(`🔗 URL: ${jsonResult.embed.url}`);
  console.log(`🖼️  Imagen: ${jsonResult.embed.image}`);
  console.log(`🕒 Fechas (ES): ${jsonResult.embed.time_es}`);
  console.log(`   - Twitch: ${jsonResult.twitch.exclusive.length} exclusivos, ${jsonResult.twitch.general.length} generales`);
  console.log(`   - Kick: ${jsonResult.kick.exclusive.length} exclusivos, ${jsonResult.kick.general.length} generales`);
})();
