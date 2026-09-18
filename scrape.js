const { chromium } = require('playwright');
const fs = require('fs');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

/**
 * Convierte y traduce cadenas de fechas en objetos Date válidos
 */
function parseFacepunchDate(str) {
  if (!str) return null;
  // Limpiar ordinales (24th -> 24) y conectores 'at'
  let cleaned = str.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/\bat\b/gi, '').trim();
  let d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Traduce nombres de meses al español
 */
function translateEventTime(timeStr) {
  if (!timeStr) return '';
  return timeStr
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
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
 * Procesa las fechas del evento, convirtiendo UTC a CEST y calculando la duración/cuenta atrás
 */
function processEventDates(rawTime) {
  if (!rawTime) {
    return { start: 'Fecha no disponible', end: 'Fecha no disponible', duration: 'N/A', countdown: 'N/A' };
  }

  const parts = rawTime.split(/—|-|\bto\b/i);
  const startRaw = parts[0] ? parts[0].trim() : '';
  const endRaw = parts[1] ? parts[1].trim() : '';

  const startDate = parseFacepunchDate(startRaw);
  const endDate = parseFacepunchDate(endRaw);

  let startFormatted = translateEventTime(startRaw);
  let endFormatted = translateEventTime(endRaw);
  let durationStr = 'No calculable';
  let countdownStr = 'No calculable';

  if (startDate && endDate) {
    const options = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    
    // Conversión horaria a CEST / Madrid
    startFormatted = `${startDate.toLocaleString('es-ES', { ...options, timeZone: 'Europe/Madrid' })} CEST`;
    endFormatted = `${endDate.toLocaleString('es-ES', { ...options, timeZone: 'Europe/Madrid' })} CEST`;

    // 1. Duración del evento
    const durationMs = endDate.getTime() - startDate.getTime();
    const durDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
    const durHours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    durationStr = `${durDays} días y ${durHours} horas`;

    // 2. Tiempo para que comience
    const now = new Date();
    const diffStartMs = startDate.getTime() - now.getTime();

    if (diffStartMs > 0) {
      const cdDays = Math.floor(diffStartMs / (1000 * 60 * 60 * 24));
      const cdHours = Math.floor((diffStartMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const cdMins = Math.floor((diffStartMs % (1000 * 60 * 60)) / (1000 * 60));
      countdownStr = `Faltan ${cdDays} días, ${cdHours} horas y ${cdMins} minutos`;
    } else if (now < endDate) {
      countdownStr = '🔥 ¡El evento ya está en activo!';
    } else {
      countdownStr = '🔴 El evento ha finalizado';
    }
  }

  return {
    start: startFormatted,
    end: endFormatted,
    duration: durationStr,
    countdown: countdownStr
  };
}

/**
 * Extrae la cabecera del evento (Banner, Título y Fechas)
 */
async function scrapeEventEmbed(page, defaultUrl) {
  return await page.evaluate((url) => {
    const titleEl = document.querySelector('.campaign-title, header h1, .event-title, h1');

    // Imagen principal del evento actual
    let imageUrl = '';
    const campaignImg = document.querySelector('.campaign-header img, header img, img[src*="files.facepunch.com"]');
    if (campaignImg && campaignImg.src) {
      imageUrl = campaignImg.src;
    } else {
      imageUrl = document.querySelector('meta[property="og:image"]')?.content || '';
    }

    // Fechas
    const timeEl = document.querySelector('.dates, .campaign-dates, .event-dates, .header-dates, .dates-container, header .subtitle');

    return {
      title: titleEl ? titleEl.innerText.trim() : 'Rust Drops',
      url: 'https://twitch.facepunch.com/',
      image: imageUrl,
      time: timeEl ? timeEl.innerText.trim() : ''
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
    await page.waitForSelector('.drop-box', { timeout: 15000 }).catch(() => null);

    const embed = await scrapeEventEmbed(page, 'https://twitch.facepunch.com/');

    const drops = await page.$$eval('.drop-box', boxes => {
      return boxes.map(box => {
        const streamerNameRaw = box.querySelector('.streamer-name, .streamer-info span, .streamer-title')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type, .drop-name')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span, .drop-time')?.innerText.trim() || 'Unknown';
        const img = box.querySelector('video img')?.src || box.querySelector('img.drop-image, img')?.src || '';
        const isGeneral = streamerNameRaw.toLowerCase().includes('general drop') || streamerNameRaw === '';

        const streamers = [];
        box.querySelectorAll('a[href*="twitch.tv"]').forEach(a => {
          streamers.push({
            name: a.innerText.trim() || streamerNameRaw || 'Streamer',
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

    return { embed, drops };
  } catch (err) {
    console.error('❌ Error scraping Twitch:', err);
    return { embed: null, drops: [] };
  } finally {
    await browser.close();
  }
}

/**
 * Scraper para Kick Drops con manejo tolerante de tiempo de espera
 */
async function scrapeKick() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('🔍 Extrayendo información de Kick Drops...');
    await page.goto('https://kick.facepunch.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.drop-box', { timeout: 8000 }).catch(() => {
      console.log('⚠️ No se encontraron tarjetas de drops en Kick.');
    });

    const embed = await scrapeEventEmbed(page, 'https://kick.facepunch.com/');

    const drops = await page.$$eval('.drop-box', boxes => {
      return boxes.map(box => {
        const streamerNameRaw = box.querySelector('.streamer-name, .streamer-info span, .streamer-title')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type, .drop-name')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span, .drop-time')?.innerText.trim() || 'Unknown';
        const img = box.querySelector('video img')?.src || box.querySelector('img.drop-image, img')?.src || '';
        const isGeneral = streamerNameRaw.toLowerCase().includes('general drop') || streamerNameRaw === '';

        const streamers = [];
        box.querySelectorAll('a[href*="kick.com"]').forEach(a => {
          streamers.push({
            name: a.innerText.trim() || streamerNameRaw || 'Streamer',
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

    return { embed, drops };
  } catch (err) {
    console.error('❌ Error scraping Kick:', err);
    return { embed: null, drops: [] };
  } finally {
    await browser.close();
  }
}

/**
 * Envío del Embed principal a Discord
 */
async function sendDiscordEventEmbed(embedData, dateDetails) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('⚠️ No se ha configurado DISCORD_WEBHOOK.');
    return;
  }

  const description = [
    `🛫 **Inicio:** ${dateDetails.start}`,
    `🛬 **Fin:** ${dateDetails.end}`,
    `⏳ **Duración del evento:** ${dateDetails.duration}`,
    `⏰ **Tiempo para el inicio:** ${dateDetails.countdown}`
  ].join('\n\n');

  const discordPayload = {
    embeds: [
      {
        title: embedData.title,
        url: embedData.url,
        description: description,
        color: 13517355,
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
      console.error(`❌ Error Discord: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('❌ Error enviando a Discord:', error);
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

  const dateDetails = processEventDates(embedHeader.time);

  // Estructura restaurada para compatibilidad completa con jq y GitHub Actions
  const jsonResult = {
    embed: {
      title: embedHeader.title,
      url: 'https://twitch.facepunch.com/',
      image: embedHeader.image,
      time: embedHeader.time,
      time_es: translateEventTime(embedHeader.time),
      time_details: dateDetails
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

  await sendDiscordEventEmbed(embedHeader, dateDetails);

  console.log(`\n✅ Scraping completado:`);
  console.log(`📌 Título: ${jsonResult.embed.title}`);
  console.log(`🖼️  Imagen: ${jsonResult.embed.image}`);
  console.log(`🛫 Inicio: ${dateDetails.start}`);
  console.log(`🛬 Fin: ${dateDetails.end}`);
  console.log(`⏳ Duración: ${dateDetails.duration}`);
  console.log(`⏰ Estado: ${dateDetails.countdown}`);
  console.log(`   - Twitch: ${jsonResult.twitch.drops.length} drops encontrados`);
  console.log(`   - Kick: ${jsonResult.kick.drops.length} drops encontrados`);
})();
