const { chromium } = require('playwright');
const fs = require('fs');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

/**
 * Traduce textos de los drops al español (incluye correcciones para "HOUR", "HOURS", etc.)
 */
function translateText(text) {
  if (!text) return '';
  let translated = text;

  translated = translated.replace(/General Drop/gi, 'Drop General');
  translated = translated.replace(/Streamer Drop/gi, 'Drop de Streamer');
  translated = translated.replace(/Exclusive/gi, 'Exclusivo');
  translated = translated.replace(/Watch for/gi, 'Ver durante');
  
  // Traducción precisa de horas y minutos
  translated = translated.replace(/\b1\s*hours?\b/gi, '1 hora');
  translated = translated.replace(/\b(\d+)\s*hours?\b/gi, '$1 horas');
  translated = translated.replace(/\b1\s*hrs?\b/gi, '1 hora');
  translated = translated.replace(/\b(\d+)\s*hrs?\b/gi, '$1 horas');
  translated = translated.replace(/\b1\s*minutes?\b/gi, '1 minuto');
  translated = translated.replace(/\b(\d+)\s*minutes?\b/gi, '$1 minutos');
  translated = translated.replace(/\b1\s*mins?\b/gi, '1 minuto');
  translated = translated.replace(/\b(\d+)\s*mins?\b/gi, '$1 mins');

  return translated.trim();
}

/**
 * Convierte cadenas de fechas en objetos Date válidos
 */
function parseFacepunchDate(str) {
  if (!str) return null;

  let cleaned = str
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/\bat\b/gi, '')
    .trim();

  if (!/\b20\d\d\b/.test(cleaned)) {
    cleaned += ` ${new Date().getFullYear()}`;
  }

  let d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;

  const match = cleaned.match(/(\d{1,2})\s+([a-zA-Z]+)\s*(\d{4})?\s*(\d{1,2}:\d{2})?/);
  if (match) {
    const day = match[1];
    const month = match[2];
    const year = match[3] || new Date().getFullYear();
    const time = match[4] || '00:00';
    d = new Date(`${month} ${day}, ${year} ${time}`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
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
 * Procesa las fechas del evento (Inicio, Fin, Duración y Cuenta atrás)
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

    startFormatted = `${startDate.toLocaleString('es-ES', { ...options, timeZone: 'Europe/Madrid' })} CEST`;
    endFormatted = `${endDate.toLocaleString('es-ES', { ...options, timeZone: 'Europe/Madrid' })} CEST`;

    // Duración entre las dos fechas
    const durationMs = endDate.getTime() - startDate.getTime();
    const durDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
    const durHours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    durationStr = `${durDays} días y ${durHours} horas`;

    // Tiempo restante para el inicio
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
 * Extrae la cabecera del evento limpiando textos basura y filtrando solo fechas
 */
async function scrapeEventEmbed(page, defaultUrl) {
  return await page.evaluate((url) => {
    // Título limpio
    const titleEl = document.querySelector('.campaign-title, header h1, .event-title, .hero h1, h1');
    const title = titleEl ? titleEl.innerText.trim() : 'Rust Drops';

    // Imagen principal PNG/JPG del evento
    let imageUrl = '';
    const allImgs = Array.from(document.querySelectorAll('img'));
    const bannerImg = allImgs.find(img => {
      const src = (img.src || '').toLowerCase();
      return src.includes('files.facepunch.com') &&
             !src.endsWith('.svg') &&
             !src.includes('svg') &&
             !src.includes('logo') &&
             !src.includes('icon') &&
             !src.includes('avatar') &&
             !src.includes('marque');
    });

    if (bannerImg) {
      imageUrl = bannerImg.src;
    } else {
      const metaOg = document.querySelector('meta[property="og:image"]')?.content || '';
      if (metaOg && !metaOg.toLowerCase().endsWith('.svg') && !metaOg.toLowerCase().includes('svg')) {
        imageUrl = metaOg;
      }
    }

    // Extracción estricta de la cadena de fechas (excluyendo títulos y subtítulos del evento)
    let timeText = '';
    const monthRegex = /(january|february|march|april|may|june|july|august|september|october|november|december)/i;
    
    // Buscar elementos específicos que contengan fecha y mes
    const candidates = Array.from(document.querySelectorAll('.dates, .campaign-dates, .event-dates, .header-dates, .dates-container, header span, header p, .subtitle'));
    for (const el of candidates) {
      const txt = el.innerText ? el.innerText.trim() : '';
      if (monthRegex.test(txt) && /\d+/.test(txt) && txt.length < 120) {
        timeText = txt;
        break;
      }
    }

    // Fallback por nodos hijos si no se encuentra en contenedores clase
    if (!timeText) {
      const elements = Array.from(document.querySelectorAll('header *, .campaign *, .hero *'));
      for (const el of elements) {
        const txt = el.innerText ? el.innerText.trim() : '';
        if (monthRegex.test(txt) && /\d+/.test(txt) && txt.length < 120 && el.children.length === 0) {
          timeText = txt;
          break;
        }
      }
    }

    return {
      title,
      url: 'https://twitch.facepunch.com/',
      image: imageUrl,
      time: timeText
    };
  }, defaultUrl);
}

/**
 * Scraper para Twitch Drops con deduplicación de streamers
 */
async function scrapeTwitch() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('🔍 Extrayendo información de Twitch Drops...');
    await page.goto('https://twitch.facepunch.com/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await page.waitForSelector('.drop-box', { timeout: 15000 }).catch(() => null);

    const embed = await scrapeEventEmbed(page, 'https://twitch.facepunch.com/');

    const drops = await page.$$eval('.drop-box', boxes => {
      return boxes.map(box => {
        const streamerNameRaw = box.querySelector('.streamer-name, .streamer-info span, .streamer-title')?.innerText.trim() || '';
        const name = box.querySelector('.drop-type, .drop-name')?.innerText.trim() || 'Unknown Drop';
        const time = box.querySelector('.drop-time span, .drop-time')?.innerText.trim() || 'Unknown';
        const img = box.querySelector('video img')?.src || box.querySelector('img.drop-image, img')?.src || '';
        const isGeneral = streamerNameRaw.toLowerCase().includes('general drop') || streamerNameRaw === '';

        // Deduplicación de streamers usando Map
        const streamersMap = new Map();
        box.querySelectorAll('a[href*="twitch.tv"]').forEach(a => {
          const streamerName = a.innerText.trim() || streamerNameRaw || 'Streamer';
          const cleanKey = streamerName.toLowerCase();
          if (cleanKey && !streamersMap.has(cleanKey)) {
            streamersMap.set(cleanKey, {
              name: streamerName,
              url: a.href,
              avatar: a.querySelector('img')?.src || ''
            });
          }
        });

        const streamers = Array.from(streamersMap.values());
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
 * Scraper para Kick Drops con deduplicación de streamers
 */
async function scrapeKick() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('🔍 Extrayendo información de Kick Drops...');
    await page.goto('https://kick.facepunch.com/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
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

        // Deduplicación de streamers usando Map
        const streamersMap = new Map();
        box.querySelectorAll('a[href*="kick.com"]').forEach(a => {
          const streamerName = a.innerText.trim() || streamerNameRaw || 'Streamer';
          const cleanKey = streamerName.toLowerCase();
          if (cleanKey && !streamersMap.has(cleanKey)) {
            streamersMap.set(cleanKey, {
              name: streamerName,
              url: a.href,
              avatar: a.querySelector('img')?.src || ''
            });
          }
        });

        const streamers = Array.from(streamersMap.values());
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
 * Envío del Embed principal del evento a Discord
 */
async function sendDiscordEventEmbed(embedData, dateDetails) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('⚠️ No se ha configurado DISCORD_WEBHOOK.');
    return;
  }

  const description = [
    `🛫 **Fecha de inicio:** ${dateDetails.start}`,
    `🛬 **Fecha final:** ${dateDetails.end}`,
    `⏳ **Duración del evento:** ${dateDetails.duration}`,
    `⏰ **Estado / Cuenta atrás:** ${dateDetails.countdown}`
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
})();
