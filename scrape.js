const { chromium } = require('playwright');
const fs = require('fs');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK;
const STATE_FILE = 'state.json';
const DROPS_FILE = 'drops.json';

const COLORS = {
  TWITCH: 9502720,
  KICK: 3066993,
  GENERAL: 2003190,
  HEADER: 13517355
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function translateItemName(name) {
  if (!name) return 'Objeto Desconocido';
  const dict = {
    "ice pickaxe": "Pico de Hielo", "pickaxe": "Pico", "salvaged axe": "Hacha Chatarra",
    "barbeque": "Barbacoa", "jackhammer": "Martillo Neumático", "hammer": "Martillo",
    "crossbow": "Ballesta", "bow": "Arco", "assault rifle": "Rifle de Asalto",
    "bolt action rifle": "Rifle de Cerrojo", "semi-automatic rifle": "Rifle Semiautomático",
    "custom smg": "SMG Personalizada", "mp5": "MP5", "thompson": "Thompson",
    "m249": "M249", "revolver": "Revólver", "m92 pistol": "Pistola M92",
    "pump shotgun": "Escopeta de Corredera", "double barrel shotgun": "Escopeta de Doble Cañón",
    "handmade shell": "Escopeta artesanal", "rocket launcher": "Lanzacohetes",
    "waterpipe shotgun": "Escopeta de Tubería", "beancan grenade": "Granada Beancan",
    "f1 grenade": "Granada F1", "smoke grenade": "Granada de Humo", "grenade": "Granada",
    "sheet metal door": "Puerta de Chapa", "armored door": "Puerta Blindada",
    "garage door": "Puerta de Garaje", "wooden door": "Puerta de Madera",
    "large wood box": "Caja de Madera Grande", "small wood box": "Caja de Madera Pequeña",
    "small box": "Caja Pequeña", "furnace": "Horno", "sleeping bag": "Saco de Dormir",
    "tool cupboard": "Armario de Herramientas", "roadsign helmet": "Casco Roadsign",
    "coffee can helmet": "Casco Lata de Café", "metal facemask": "Mascarilla Metálica",
    "roadsign jacket": "Chaqueta Roadsign", "roadsign pants": "Pantalones Roadsign",
    "roadsign kilt": "Falda Roadsign", "hoodie": "Sudadera", "cargo pants": "Pantalones Cargo",
    "pants": "Pantalones", "boots": "Botas", "tactical gloves": "Guantes Tácticos",
    "gloves": "Guantes", "metal chestplate": "Pechera HQ", "chest plate": "Placa de Pecho",
    "facemask": "Mascarilla", "bandana": "Bandana", "balaclava": "Pasamontañas",
    "beanie hat": "Gorro", "boonie hat": "Sombrero", "hazmat suit": "Hazmat",
    "wetsuit": "Traje de Buceo", "backpack": "Mochila", "rock": "Roca",
    "jacket": "Chaqueta", "auto turret": "Torreta", "salvaged sword": "Espada",
    "locker": "Taquilla"
  };

  const lowerName = name.toLowerCase();
  for (const [eng, esp] of Object.entries(dict)) {
    if (lowerName.includes(eng)) return esp;
  }
  return name;
}

function translateText(text) {
  if (!text) return '';
  let translated = text;
  translated = translated.replace(/General Drop/gi, 'Drop General');
  translated = translated.replace(/Streamer Drop/gi, 'Drop de Streamer');
  translated = translated.replace(/Exclusive/gi, 'Exclusivo');
  translated = translated.replace(/Watch for/gi, 'Ver durante');
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

function parseFacepunchDate(str) {
  if (!str) return null;
  let cleaned = str.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/\bat\b/gi, '').trim();
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

function translateEventTime(timeStr) {
  if (!timeStr) return '';
  return timeStr
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/January/gi, 'enero').replace(/February/gi, 'febrero').replace(/March/gi, 'marzo')
    .replace(/April/gi, 'abril').replace(/May/gi, 'mayo').replace(/June/gi, 'junio')
    .replace(/July/gi, 'julio').replace(/August/gi, 'agosto').replace(/September/gi, 'septiembre')
    .replace(/October/gi, 'octubre').replace(/November/gi, 'noviembre').replace(/December/gi, 'diciembre')
    .replace(/\bat\b/gi, 'a las').replace(/\bto\b/gi, 'al').trim();
}

function processEventDates(rawTime) {
  if (!rawTime) {
    return { start: 'Fecha no disponible', end: 'Fecha no disponible', duration: 'N/A', countdown: 'N/A' };
  }

  const parts = rawTime.split(/—|–|-|\bto\b|\buntil\b|\n/i);
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

    const durationMs = endDate.getTime() - startDate.getTime();
    const durDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
    const durHours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    durationStr = `${durDays} días y ${durHours} horas`;

    const now = new Date();
    const diffStartMs = startDate.getTime() - now.getTime();

    if (diffStartMs > 0) {
      const cdDays = Math.floor(diffStartMs / (1000 * 60 * 60 * 24));
      const cdHours = Math.floor((diffStartMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const cdMins = Math.floor((diffStartMs % (1000 * 60 * 60)) / (1000 * 60));
      countdownStr = `Faltan ${cdDays} días, ${cdHours} horas y ${cdMins} minutos`;
    } else if (now < endDate) {
      countdownStr = '🔥 ¡El evento ya está activo!';
    } else {
      countdownStr = '🔴 El evento ha finalizado';
    }
  }

  return {
    start: startFormatted || 'Fecha no disponible',
    end: endFormatted || 'Fecha no disponible',
    duration: durationStr,
    countdown: countdownStr
  };
}

async function scrapePlatform(context, url) {
  const page = await context.newPage();
  try {
    console.log(`🔍 Extrayendo información de: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await page.waitForSelector('.drop-box', { timeout: 15000 }).catch(() => null);

    const embed = await page.evaluate((baseUrl) => {
      const titleEl = document.querySelector('.campaign-title, header h1, .event-title, .hero h1, h1');
      let title = titleEl ? titleEl.innerText.trim() : 'Rust Drops';
      title = title.split('\n')[0].trim();

      let imageUrl = '';
      const allImgs = Array.from(document.querySelectorAll('img'));
      const bannerImg = allImgs.find(img => {
        const src = (img.src || '').toLowerCase();
        return src.includes('files.facepunch.com') &&
               !src.endsWith('.svg') && !src.includes('svg') &&
               !src.includes('logo') && !src.includes('icon') &&
               !src.includes('avatar') && !src.includes('marque');
      });

      if (bannerImg) {
        imageUrl = bannerImg.src;
      } else {
        const metaOg = document.querySelector('meta[property="og:image"]')?.content || '';
        if (metaOg && !metaOg.toLowerCase().endsWith('.svg') && !metaOg.toLowerCase().includes('svg')) {
          imageUrl = metaOg;
        }
      }

      let timeText = '';
      const monthRegex = /(january|february|march|april|may|june|july|august|september|october|november|december)/i;

      const dateContainers = document.querySelectorAll('.dates, .campaign-dates, .event-dates, .header-dates, .dates-container, header .subtitle');
      for (const el of dateContainers) {
        const txt = el.innerText ? el.innerText.replace(/\s+/g, ' ').trim() : '';
        if (monthRegex.test(txt) && /\d+/.test(txt)) {
          timeText = txt;
          break;
        }
      }

      if (!timeText || (!timeText.includes('—') && !timeText.includes('-') && !/to|until/i.test(timeText))) {
        const leafElements = Array.from(document.querySelectorAll('header *, .campaign *, .hero *'))
          .filter(el => el.children.length === 0 && monthRegex.test(el.innerText || ''));

        if (leafElements.length >= 2) {
          timeText = `${leafElements[0].innerText.trim()} — ${leafElements[1].innerText.trim()}`;
        } else if (leafElements.length === 1 && leafElements[0].parentElement) {
          const parentTxt = leafElements[0].parentElement.innerText.replace(/\s+/g, ' ').trim();
          if (monthRegex.test(parentTxt)) {
            timeText = parentTxt;
          }
        }
      }

      return { title, url: baseUrl, image: imageUrl, time: timeText };
    }, url);

    const drops = await page.$$eval('.drop-box', (boxes, isKick) => {
      const defaultLogo = isKick
        ? 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/kick.png'
        : 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/twitch.png';

      return boxes.map(box => {
        const streamerNameRaw = box.querySelector('.streamer-name, .streamer-info span, .streamer-title')?.innerText.trim() || '';
        const isGeneral = streamerNameRaw.toLowerCase().includes('general drop') || streamerNameRaw === '';
        const name = box.querySelector('.drop-type, .drop-name')?.innerText.trim() || 'Unknown Drop';
        const img = box.querySelector('video img')?.src || box.querySelector('img.drop-image, img')?.src || '';
        const time = box.querySelector('.drop-time span, .drop-time')?.innerText.trim() || 'Unknown';

        const streamersMap = new Map();
        let firstAvatar = '';

        box.querySelectorAll(`a[href*="${isKick ? 'kick.com' : 'twitch.tv'}"]`).forEach(a => {
          const streamerName = a.innerText.trim() || streamerNameRaw || 'Streamer';
          const cleanKey = streamerName.toLowerCase();
          
          if (cleanKey && !streamersMap.has(cleanKey)) {
            let avatarSrc = a.querySelector('img')?.src || '';
            if (!avatarSrc) {
               const avatarFallback = box.querySelector('.avatar img, img.avatar, .streamer-image img');
               if (avatarFallback) avatarSrc = avatarFallback.src;
            }
            if (!firstAvatar && avatarSrc) firstAvatar = avatarSrc;
            streamersMap.set(cleanKey, { name: streamerName, url: a.href, avatar: avatarSrc });
          }
        });

        const streamers = Array.from(streamersMap.values());
        const type = isGeneral || streamers.length === 0 ? 'General' : 'Exclusivo';
        
        // Guardamos la imagen de perfil principal del drop para el JSON
        const profileImage = type === 'General' ? defaultLogo : (firstAvatar || defaultLogo);
        const dropLink = box.querySelector('a')?.href || '';
        
        return {
          id: dropLink || img || name,
          name,
          time,
          img,
          profile_image: profileImage,
          streamers,
          type
        };
      });
    }, url.includes('kick'));

    return { 
      embed, 
      drops: drops.map(d => ({ ...d, name_es: translateText(d.name), time_es: translateText(d.time), type_es: translateText(d.type) })) 
    };
  } catch (err) {
    console.error(`❌ Error scraping ${url}:`, err);
    return { embed: null, drops: [] };
  } finally {
    await page.close();
  }
}

async function sendDiscordWebhook(payload) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('❌ Error enviando a Discord:', error);
  }
}

async function processAndSendDrops(platformName, currentDrops, previousDrops, color) {
  const previousIds = new Set(previousDrops.map(d => d.id));
  const newDrops = currentDrops.filter(d => !previousIds.has(d.id));

  if (newDrops.length === 0) return currentDrops;

  console.log(`🚀 Enviando ${newDrops.length} nuevos drops de ${platformName} a Discord...`);

  for (const drop of newDrops) {
    const isExclusivo = drop.streamers.length > 0;
    const translatedName = translateItemName(drop.name);
    
    let title, description, url;
    
    if (isExclusivo) {
      title = `⭐ Drop Exclusivo (${platformName})`;
      url = drop.streamers[0].url;
      const strLinks = drop.streamers.map(s => `[${s.name}](${s.url})`).join(", ");
      description = `🎁 **${translatedName}**\n⏱ ${drop.time_es || drop.time}\n🎮 ${strLinks}\n📺 Plataforma: ${platformName}`;
    } else {
      title = `🌍 Drop General (${platformName})`;
      url = platformName === 'Kick' ? 'https://kick.com/categories/games/rust' : 'https://www.twitch.tv/directory/category/rust';
      description = `🎁 **${translatedName}**\n⏱ ${drop.time_es || drop.time}\n🌍 Disponible en todos los canales participantes con drops.`;
    }

    // Embed de Discord original, sin modificaciones
    await sendDiscordWebhook({
      embeds: [{
        title, url, description, color,
        thumbnail: { url: drop.img }
      }]
    });
    await delay(1500); 
  }

  return currentDrops;
}

// ========================
// EJECUCIÓN PRINCIPAL
// ========================
(async () => {
  let state = { event_title: '', last_header_sent: '', twitch: { drops: [] }, kick: { drops: [] } };
  if (fs.existsSync(STATE_FILE)) {
    try { 
      const loadedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); 
      state = {
        ...state,
        ...loadedState,
        twitch: loadedState.twitch || { drops: [] },
        kick: loadedState.kick || { drops: [] }
      };
    } 
    catch (e) { console.error('⚠️ Aviso: No se pudo leer state.json, iniciando limpio.'); }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const twitchData = await scrapePlatform(context, 'https://twitch.facepunch.com/');
  const kickData = await scrapePlatform(context, 'https://kick.facepunch.com/'); 
  await browser.close();

  const embedHeader = twitchData.embed || kickData.embed || { title: 'Rust Drops', url: 'https://twitch.facepunch.com/', image: '', time: '' };
  const dateDetails = processEventDates(embedHeader.time);
  const todayStr = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });

  if (state.last_header_sent !== todayStr && embedHeader.title) {
    console.log(`📢 Enviando cabecera del evento: ${embedHeader.title}`);
    await sendDiscordWebhook({
      embeds: [{
        title: embedHeader.title,
        url: embedHeader.url,
        description: `🛫 **Fecha de inicio:** ${dateDetails.start}\n🛬 **Fecha final:** ${dateDetails.end}\n⏳ **Duración del evento:** ${dateDetails.duration}\n⏰ **Estado / Cuenta atrás:** ${dateDetails.countdown}`,
        color: COLORS.HEADER,
        image: embedHeader.image ? { url: embedHeader.image } : undefined,
        footer: { text: 'Rust Facepunch Drops Event' }
      }]
    });
    state.last_header_sent = todayStr;
    await delay(2000);
  } else {
    console.log('ℹ️ El embed del evento ya se envió hoy. Omitiendo envío a Discord de la cabecera.');
  }

  state.twitch.drops = await processAndSendDrops('Twitch', twitchData.drops || [], state.twitch?.drops || [], COLORS.TWITCH);
  state.kick.drops = await processAndSendDrops('Kick', kickData.drops || [], state.kick?.drops || [], COLORS.KICK);
  state.event_title = embedHeader.title;

  // Los drops en el JSON ahora incluyen la propiedad "profile_image"
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  fs.writeFileSync(DROPS_FILE, JSON.stringify({
    last_header_sent: state.last_header_sent,
    embed: { ...embedHeader, time_es: translateEventTime(embedHeader.time), time_details: dateDetails },
    twitch: state.twitch,
    kick: state.kick
  }, null, 2));

  console.log(`\n✅ Ejecución finalizada correctamente.`);
  console.log(`📌 Título: ${embedHeader.title}`);
  console.log(`🛫 Inicio: ${dateDetails.start}`);
  console.log(`🛬 Fin: ${dateDetails.end}`);
  console.log(`⏳ Duración: ${dateDetails.duration}`);
  console.log(`⏰ Estado: ${dateDetails.countdown}`);
})();
