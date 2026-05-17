export type Lang = 'es' | 'en';

export interface GearItem {
  id: string;
  name: { es: string; en: string };
  description: { es: string; en: string };
  category: string;
  subcategory?: string;
  tier: 'budget' | 'mid' | 'pro';
  priceRange: string;
  recommended?: boolean;
  amazonUrl: { es: string; en: string };
  image?: string;
}

export interface GearCategory {
  key: string;
  name: { es: string; en: string };
  icon: string;
  color: string;
}

export const GEAR_CATEGORIES: GearCategory[] = [
  { key: 'cameras',      name: { es: 'Cámaras',       en: 'Cameras' },       icon: '📷', color: '#e84d5b' },
  { key: 'microphones',  name: { es: 'Micrófonos',    en: 'Microphones' },   icon: '🎙️', color: '#00E5FF' },
  { key: 'lighting',     name: { es: 'Iluminación',   en: 'Lighting' },      icon: '💡', color: '#FFE800' },
  { key: 'accessories',  name: { es: 'Accesorios',    en: 'Accessories' },   icon: '🎒', color: '#7CFF00' },
  { key: 'audio',        name: { es: 'Audio',         en: 'Audio' },         icon: '🎧', color: '#FF00AA' },
  { key: 'hardware',     name: { es: 'Hardware',      en: 'Hardware' },      icon: '🖥️', color: '#FF8A00' },
  { key: 'software',     name: { es: 'Software',      en: 'Software' },      icon: '💻', color: '#B388FF' },
  { key: 'accessibility', name: { es: 'Accesibilidad y Confort', en: 'Accessibility & Comfort' }, icon: '♿', color: '#4FC3F7' },
];

// Subcategories for accessibility (each becomes its own page)
export const ACCESSIBILITY_SUBCATEGORIES: GearCategory[] = [
  { key: 'noise-cancelling',   name: { es: 'Cancelación de Ruido', en: 'Noise Cancelling' },       icon: '🎧', color: '#4FC3F7' },
  { key: 'fidget-tools',       name: { es: 'Herramientas Fidget', en: 'Fidget Tools' },            icon: '🤲', color: '#7CFF00' },
  { key: 'deep-pressure',      name: { es: 'Presión Profunda', en: 'Deep Pressure' },              icon: '🧸', color: '#FF8A00' },
  { key: 'wearables-rings',    name: { es: 'Wearables y Anillos', en: 'Wearables & Rings' },       icon: '💍', color: '#B388FF' },
  { key: 'movement',           name: { es: 'Movimiento', en: 'Movement' },                         icon: '🏋️', color: '#00E5FF' },
  { key: 'timers',             name: { es: 'Temporizadores', en: 'Timers' },                       icon: '⏱️', color: '#FFE800' },
];

// All categories including accessibility subcategories (for routing)
export const ALL_GEAR_SLUGS: string[] = [
  ...GEAR_CATEGORIES.map(c => c.key),
  ...ACCESSIBILITY_SUBCATEGORIES.map(c => c.key),
];

export function getCategoryBySlug(slug: string): GearCategory | undefined {
  return GEAR_CATEGORIES.find(c => c.key === slug)
    || ACCESSIBILITY_SUBCATEGORIES.find(c => c.key === slug);
}

export function getItemsForSlug(slug: string): GearItem[] {
  const subcat = ACCESSIBILITY_SUBCATEGORIES.find(c => c.key === slug);
  if (subcat) return GEAR_ITEMS.filter(i => i.subcategory === slug);
  if (slug === 'accessibility') return GEAR_ITEMS.filter(i => i.category === 'accessibility' && !i.subcategory);
  return GEAR_ITEMS.filter(i => i.category === slug);
}

export const AMAZON_TAGS = {
  es: 'ytubviral-21',
  en: 'ytubviral0b-21',
};

export const GEAR_ITEMS: GearItem[] = [
  // ── Cameras (updated May 2026) ───────────────────────────────────
  {
    id: 'dji-osmo-pocket-3',
    name: { es: 'DJI Osmo Pocket 3', en: 'DJI Osmo Pocket 3' },
    description: {
      es: 'Gimbal de 3 ejes con sensor CMOS de 1", 4K/120fps, seguimiento facial, pantalla táctil giratoria de 2". La mejor opción para vlogs y contenido en movimiento. Cabe en un bolsillo.',
      en: '3-axis gimbal with 1" CMOS sensor, 4K/120fps, face tracking, 2" rotatable touchscreen. The best option for vlogs and on-the-go content. Fits in a pocket.',
    },
    category: 'cameras',
    tier: 'budget',
    priceRange: '€380-520',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0CG19QXWD',
      en: 'https://www.amazon.co.uk/dp/B0CG19QXWD',
    },
    image: '/gear/dji-osmo-pocket-3.png',
  },
  {
    id: 'sony-zv-e10ii',
    name: { es: 'Sony ZV-E10 II', en: 'Sony ZV-E10 II' },
    description: {
      es: 'La mirrorless #1 para creadores en 2026. Sensor APS-C 26MP, 4K/60fps, autofoco con IA, estabilización digital, lentes intercambiables. El consenso absoluto en calidad/precio.',
      en: 'The #1 mirrorless for creators in 2026. 26MP APS-C sensor, 4K/60fps, AI autofocus, digital stabilization, interchangeable lenses. The absolute consensus in value.',
    },
    category: 'cameras',
    tier: 'mid',
    priceRange: '€800-1000',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0D8QRHQNL',
      en: 'https://www.amazon.co.uk/dp/B0D8QRHQNL',
    },
    image: '/gear/sony-zv-e10ii.png',
  },
  {
    id: 'sony-a6700',
    name: { es: 'Sony a6700', en: 'Sony a6700' },
    description: {
      es: 'El rey APS-C pro. 26MP, 4K/120fps, S-Log3 para cine, autofoco con IA, estabilización de 5 ejes, sellado contra polvo. Todo lo que hace la ZV-E10 II pero con controles y features pro.',
      en: 'The pro APS-C king. 26MP, 4K/120fps, S-Log3 for cinema, AI autofocus, 5-axis stabilization, weather sealing. Everything the ZV-E10 II does but with pro controls and features.',
    },
    category: 'cameras',
    tier: 'pro',
    priceRange: '€1400-1600',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0CB8T476W',
      en: 'https://www.amazon.co.uk/dp/B0CB8T476W',
    },
    image: '/gear/sony-a6700.png',
  },

  // ── Microphones (updated May 2026) ───────────────────────────────
  {
    id: 'samson-q2u',
    name: { es: 'Samson Q2U', en: 'Samson Q2U' },
    description: {
      es: 'El rey del presupuesto. Dinámico con USB + XLR: empieza simple y escala después. Rechaza ruido de habitación, incluye trípode, cables y paravientos. Menos de 70€.',
      en: 'The budget king. Dynamic with USB + XLR: start simple and scale later. Rejects room noise, includes tripod, cables and windscreen. Under £60.',
    },
    category: 'microphones',
    tier: 'budget',
    priceRange: '€60-70',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B001R747SG',
      en: 'https://www.amazon.co.uk/dp/B001R747SG',
    },
    image: '/gear/samson-q2u.png',
  },
  {
    id: 'rode-podmic-usb',
    name: { es: 'Rode PodMic USB', en: 'Rode PodMic USB' },
    description: {
      es: 'Calidad broadcast con USB + XLR. Sonido rico y cálido con excelente rechazo de ruido. Se ve profesional en cámara. La opción "no pienses más" para podcasters serios.',
      en: 'Broadcast quality with USB + XLR. Rich, warm sound with excellent noise rejection. Looks professional on camera. The "just works" choice for serious podcasters.',
    },
    category: 'microphones',
    tier: 'mid',
    priceRange: '€150-180',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0BQM4TKF7',
      en: 'https://www.amazon.co.uk/dp/B0BQM4TKF7',
    },
    image: '/gear/rode-podmic-usb.png',
  },
  {
    id: 'shure-mv7plus',
    name: { es: 'Shure MV7+', en: 'Shure MV7+' },
    description: {
      es: 'El #1 recomendado en 2026 para YouTube/podcasting. Sucesor del MV7 con panel LED táctil, auto-level, filtro anti-pop digital, USB-C + XLR. Sonido de estudio, facilidad de USB.',
      en: 'The #1 recommended for YouTube/podcasting in 2026. MV7 successor with LED touch panel, auto-level, digital pop filter, USB-C + XLR. Studio sound, USB convenience.',
    },
    category: 'microphones',
    tier: 'pro',
    priceRange: '€290-320',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0CTJ7PVN1',
      en: 'https://www.amazon.co.uk/dp/B0CTJ7PVN1',
    },
    image: '/gear/shure-mv7plus.png',
  },
  {
    id: 'shure-sm7db',
    name: { es: 'Shure SM7dB', en: 'Shure SM7dB' },
    description: {
      es: 'El legendario SM7B con preamplificador integrado (+28dB). Ya no necesitas Cloudlifter. El micrófono que usan Joe Rogan y los mejores estudios del mundo. Solo XLR.',
      en: 'The legendary SM7B with built-in preamp (+28dB). No Cloudlifter needed anymore. The mic used by Joe Rogan and the world\'s top studios. XLR only.',
    },
    category: 'microphones',
    tier: 'pro',
    priceRange: '€400-500',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0CCSVYWMH',
      en: 'https://www.amazon.co.uk/dp/B0CCSVYWMH',
    },
    image: '/gear/shure-sm7db.png',
  },

  // ── Lighting ─────────────────────────────────────────────────────
  {
    id: 'neewer-660',
    name: { es: 'Neewer 660 LED Panel (x2)', en: 'Neewer 660 LED Panel (x2)' },
    description: {
      es: 'Kit de 2 paneles LED bicolor (3200-5600K), CRI 96+, con trípodes. Dos paneles a 45° = setup profesional de iluminación por menos de 100€. El más recomendado para empezar.',
      en: '2-pack bi-color LED panels (3200-5600K), CRI 96+, with stands. Two panels at 45° = professional lighting setup for under £90. The most recommended to get started.',
    },
    category: 'lighting',
    tier: 'budget',
    priceRange: '€80-120',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B073XJN7XL',
      en: 'https://www.amazon.co.uk/dp/B073PV3RXD',
    },
    image: '/gear/neewer-660.png',
  },
  {
    id: 'neewer-ring-light-18',
    name: { es: 'Neewer 18" Anillo de Luz LED', en: 'Neewer 18" LED Ring Light' },
    description: {
      es: 'Anillo de luz de 48cm, 52W, 5500K regulable con trípode y soporte para móvil. Ideal para vlogs, tutoriales y thumbnails. Iluminación uniforme sin sombras duras que favorece cualquier tipo de rostro.',
      en: '48cm ring light, 52W, 5500K dimmable with tripod and phone holder. Perfect for vlogs, tutorials and thumbnails. Even lighting with no harsh shadows that flatters any face.',
    },
    category: 'lighting',
    tier: 'mid',
    priceRange: '€50-80',
    amazonUrl: {
      es: 'https://amzn.eu/d/08AJiBkO',
      en: 'https://www.amazon.co.uk/dp/B0798BHRV5',
    },
    image: '/gear/neewer-ring-light.png',
  },
  {
    id: 'elgato-key-light',
    name: { es: 'Elgato Key Light', en: 'Elgato Key Light' },
    description: {
      es: 'Control desde app (móvil/PC), 2800 lúmenes, temperatura ajustable. Brazo de escritorio incluido. El estándar de la industria para streamers y YouTubers profesionales.',
      en: 'App control (phone/PC), 2800 lumens, adjustable temperature. Desk arm included. The industry standard for professional streamers and YouTubers.',
    },
    category: 'lighting',
    tier: 'pro',
    priceRange: '€170-200',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B07L755X9G',
      en: 'https://www.amazon.co.uk/dp/B07L755X9G',
    },
    image: '/gear/elgato-key-light.png',
  },

  // ── Accessories ──────────────────────────────────────────────────
  {
    id: 'elgato-green-screen',
    name: { es: 'Elgato Green Screen', en: 'Elgato Green Screen' },
    description: {
      es: 'Chroma key retráctil con marco neumático. Se despliega en segundos, se recoge sin arrugas. El estándar de la industria para fondos virtuales y thumbnails.',
      en: 'Retractable chroma key with pneumatic frame. Deploys in seconds, retracts wrinkle-free. The industry standard for virtual backgrounds and thumbnails.',
    },
    category: 'accessories',
    tier: 'mid',
    priceRange: '€130-160',
    amazonUrl: {
      es: 'https://amzn.eu/d/0iTOMZUB',
      en: 'https://www.amazon.co.uk/dp/B0743Z892W',
    },
    image: '/gear/elgato-green-screen.png',
  },
  {
    id: 'rode-wireless-go-ii',
    name: { es: 'Rode Wireless Go II', en: 'Rode Wireless Go II' },
    description: {
      es: 'Sistema inalámbrico dual: 2 transmisores con micro integrado + 1 receptor. Grabación interna de respaldo, 200m de alcance. Sigue siendo el #1 para entrevistas y exteriores en 2026.',
      en: 'Dual wireless system: 2 transmitters with built-in mic + 1 receiver. Internal backup recording, 200m range. Still the #1 for interviews and outdoors in 2026.',
    },
    category: 'accessories',
    tier: 'mid',
    priceRange: '€250-300',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B08XFQ6KP9',
      en: 'https://www.amazon.co.uk/dp/B08XFQ6KP9',
    },
    image: '/gear/rode-wireless-go-ii.png',
  },
  {
    id: 'samsung-t7',
    name: { es: 'Samsung T7 SSD 1TB', en: 'Samsung T7 SSD 1TB' },
    description: {
      es: 'SSD externo ultrarrápido (1050 MB/s). Transfiere 20GB de 4K en ~20 segundos. Tamaño tarjeta de crédito, resistente a caídas de 2m. Imprescindible para editores.',
      en: 'Ultrafast external SSD (1050 MB/s). Transfers 20GB of 4K in ~20 seconds. Credit card sized, survives 2m drops. Essential for editors.',
    },
    category: 'accessories',
    tier: 'budget',
    priceRange: '€80-110',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B087DFLF9S',
      en: 'https://www.amazon.co.uk/dp/B087DFLF9S',
    },
    image: '/gear/samsung-t7.png',
  },
  {
    id: 'manfrotto-pixi',
    name: { es: 'Manfrotto PIXI Mini Tripod', en: 'Manfrotto PIXI Mini Tripod' },
    description: {
      es: 'Mini trípode de mesa robusto. Se abre con una mano, aguanta mirrorless. Perfecto para escritorio, viajes o como grip de vlogging.',
      en: 'Robust mini tabletop tripod. Opens with one hand, holds mirrorless cameras. Perfect for desk, travel, or as a vlogging grip.',
    },
    category: 'accessories',
    tier: 'budget',
    priceRange: '€25-35',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B00D76RNLS',
      en: 'https://www.amazon.co.uk/dp/B00D76RNLS',
    },
    image: '/gear/manfrotto-pixi.png',
  },

  // ── Audio ────────────────────────────────────────────────────────
  {
    id: 'beyerdynamic-dt770',
    name: { es: 'Beyerdynamic DT 770 Pro', en: 'Beyerdynamic DT 770 Pro' },
    description: {
      es: 'Auriculares cerrados de estudio. El estándar para edición de vídeo: aislamiento superior, confort extremo en sesiones largas, sonido neutro. Versión 80 Ohm recomendada.',
      en: 'Closed-back studio headphones. The standard for video editing: superior isolation, extreme comfort in long sessions, neutral sound. 80 Ohm version recommended.',
    },
    category: 'audio',
    tier: 'mid',
    priceRange: '€130-160',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0016MNAAI',
      en: 'https://www.amazon.co.uk/dp/B0016MNAAI',
    },
    image: '/gear/beyerdynamic-dt770.png',
  },
  {
    id: 'focusrite-scarlett-2i2',
    name: { es: 'Focusrite Scarlett 2i2 (4th Gen)', en: 'Focusrite Scarlett 2i2 (4th Gen)' },
    description: {
      es: 'La interfaz de audio más recomendada en 2026. Previos de 4ª gen, Auto Gain, modo Air para voces, USB-C, 120dB de rango dinámico. Incluye Pro Tools Intro y Ableton Live Lite.',
      en: 'The most recommended audio interface in 2026. 4th gen preamps, Auto Gain, Air mode for vocals, USB-C, 120dB dynamic range. Includes Pro Tools Intro and Ableton Live Lite.',
    },
    category: 'audio',
    tier: 'mid',
    priceRange: '€160-180',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0C5JRTS3Y',
      en: 'https://www.amazon.co.uk/dp/B0C5JRTS3Y',
    },
    image: '/gear/focusrite-scarlett-2i2.png',
  },

  // ── Hardware ─────────────────────────────────────────────────────
  {
    id: 'apple-macbook-air-m3',
    name: { es: 'Apple MacBook Air M3 (15")', en: 'Apple MacBook Air M3 (15")' },
    description: {
      es: 'Edición 4K fluida sin ventilador, 18h de batería, pantalla Liquid Retina de 15". 16GB RAM + 512GB SSD. El portátil favorito de creadores por rendimiento/portabilidad.',
      en: 'Smooth 4K editing with no fan, 18h battery, 15" Liquid Retina display. 16GB RAM + 512GB SSD. Creators\' favorite laptop for performance/portability.',
    },
    category: 'hardware',
    tier: 'mid',
    priceRange: '€1400-1600',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0CX254C49',
      en: 'https://www.amazon.co.uk/dp/B0CX2549J4',
    },
    image: '/gear/apple-macbook-air-m3.png',
  },
  {
    id: 'apple-macbook-pro-m4',
    name: { es: 'Apple MacBook Pro M4 Pro (14")', en: 'Apple MacBook Pro M4 Pro (14")' },
    description: {
      es: 'La bestia para edición profesional. Chip M4 Pro, hasta 48GB RAM, pantalla XDR, codec ProRes por hardware. Timeline de 8K sin despeinarse.',
      en: 'The beast for professional editing. M4 Pro chip, up to 48GB RAM, XDR display, hardware ProRes codec. 8K timeline without breaking a sweat.',
    },
    category: 'hardware',
    tier: 'pro',
    priceRange: '€2200-3000',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0DLJGSLV5',
      en: 'https://www.amazon.co.uk/dp/B0DLHWDGSR',
    },
    image: '/gear/apple-macbook-pro-m4.png',
  },
  {
    id: 'dell-s2722qc',
    name: { es: 'Dell S2722QC Monitor 4K 27"', en: 'Dell S2722QC 4K 27" Monitor' },
    description: {
      es: 'Monitor 4K UHD IPS de 27", USB-C con carga de 65W, 99% sRGB, altavoces integrados. La mejor relación calidad/precio para edición de vídeo.',
      en: '27" 4K UHD IPS monitor, USB-C with 65W charging, 99% sRGB, built-in speakers. The best value for video editing.',
    },
    category: 'hardware',
    tier: 'mid',
    priceRange: '€300-400',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B09CGY99X5',
      en: 'https://www.amazon.co.uk/dp/B09DTDRJWP',
    },
    image: '/gear/dell-s2722qc.png',
  },
  {
    id: 'logitech-mx-master-3s',
    name: { es: 'Logitech MX Master 3S', en: 'Logitech MX Master 3S' },
    description: {
      es: 'El ratón de referencia para editores. Rueda MagSpeed para scroll en timelines, sensor 8K DPI, USB-C, Bluetooth, 70 días de batería. Botones programables para atajos de edición.',
      en: 'The reference mouse for editors. MagSpeed wheel for timeline scrolling, 8K DPI sensor, USB-C, Bluetooth, 70-day battery. Programmable buttons for editing shortcuts.',
    },
    category: 'hardware',
    tier: 'mid',
    priceRange: '€90-110',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B07W5JKHFZ',
      en: 'https://www.amazon.co.uk/dp/B07W5JKHFZ',
    },
    image: '/gear/logitech-mx-master-3s.png',
  },
  {
    id: 'logitech-mx-keys-s',
    name: { es: 'Logitech MX Keys S', en: 'Logitech MX Keys S' },
    description: {
      es: 'Teclado de perfil bajo con retroiluminación inteligente, teclas cóncavas, USB-C, multi-dispositivo. Companion perfecto del MX Master 3S para edición.',
      en: 'Low-profile keyboard with smart backlighting, concave keys, USB-C, multi-device. Perfect companion to the MX Master 3S for editing.',
    },
    category: 'hardware',
    tier: 'mid',
    priceRange: '€100-120',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B07W6JPM9R',
      en: 'https://www.amazon.co.uk/dp/B07W5JK38Y',
    },
    image: '/gear/logitech-mx-keys-s.png',
  },

  // ── Software / Tools ────────────────────────────────────────────
  {
    id: 'elgato-stream-deck',
    name: { es: 'Elgato Stream Deck MK.2', en: 'Elgato Stream Deck MK.2' },
    description: {
      es: '15 teclas LCD programables. Atajos para OBS, escenas, efectos de sonido, luces. El controlador más usado por streamers y creadores profesionales.',
      en: '15 programmable LCD keys. Shortcuts for OBS, scenes, sound effects, lights. The most used controller by professional streamers and creators.',
    },
    category: 'software',
    tier: 'mid',
    priceRange: '€130-160',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B09738CV2G',
      en: 'https://www.amazon.co.uk/dp/B09738CV2G',
    },
    image: '/gear/elgato-stream-deck.png',
  },
  {
    id: 'davinci-resolve',
    name: { es: 'DaVinci Resolve Speed Editor', en: 'DaVinci Resolve Speed Editor' },
    description: {
      es: 'Controlador con jog wheel + licencia DaVinci Resolve Studio (~295€ de valor). Cortes ultra-rápidos con teclas dedicadas. Bluetooth + USB-C. Ideal si editas a diario.',
      en: 'Controller with jog wheel + DaVinci Resolve Studio license (~£295 value). Ultra-fast cuts with dedicated keys. Bluetooth + USB-C. Ideal if you edit daily.',
    },
    category: 'software',
    tier: 'mid',
    priceRange: '€350-400',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B08N5LTPWZ',
      en: 'https://www.amazon.co.uk/dp/B08N5LTPWZ',
    },
    image: '/gear/davinci-resolve.png',
  },

  // ── Accessibility & Comfort ─────────────────────────────────────
  {
    id: 'sony-wh1000xm5',
    name: { es: 'Sony WH-1000XM5', en: 'Sony WH-1000XM5' },
    description: {
      es: 'Los auriculares con cancelación de ruido #1 del mercado. 30h de batería, audio Hi-Res, multipoint Bluetooth. Imprescindibles para creadores neurodivergentes que necesitan bloquear estímulos sensoriales durante la edición o la escritura de guiones.',
      en: 'The #1 noise-cancelling headphones on the market. 30h battery, Hi-Res audio, multipoint Bluetooth. Essential for neurodivergent creators who need to block sensory stimuli during editing or script writing.',
    },
    category: 'accessibility',
    subcategory: 'noise-cancelling',
    tier: 'pro',
    priceRange: '€300-380',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B09Y2MYL5C',
      en: 'https://www.amazon.co.uk/dp/B09Y2MYL5C',
    },
    image: '/gear/sony-wh1000xm5.webp',
  },
  {
    id: 'loop-quiet-2',
    name: { es: 'Loop Quiet 2 Tapones', en: 'Loop Quiet 2 Earplugs' },
    description: {
      es: 'Tapones de silicona reutilizables con reducción de 24dB. Discretos, cómodos, 4 tallas. Perfectos para sobrecarga sensorial sin aislarte del todo — escuchas conversaciones pero el ruido de fondo desaparece.',
      en: 'Reusable silicone earplugs with 24dB reduction. Discreet, comfortable, 4 sizes. Perfect for sensory overload without total isolation — you hear conversations but background noise disappears.',
    },
    category: 'accessibility',
    subcategory: 'noise-cancelling',
    tier: 'budget',
    priceRange: '€20-30',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0D3V6Y38G',
      en: 'https://www.amazon.co.uk/dp/B0D3V61JC8',
    },
    image: '/gear/loop-quiet-2.webp',
  },
  {
    id: 'time-timer-mod',
    name: { es: 'Time Timer MOD Home', en: 'Time Timer MOD Home' },
    description: {
      es: 'Temporizador visual de 60 minutos con funcionamiento silencioso. El disco rojo se reduce visualmente conforme pasa el tiempo — ideal para técnica Pomodoro con TDAH. Sin tictac, sin ansiedad. Lo recomiendan terapeutas ocupacionales.',
      en: '60-minute visual timer with silent operation. The red disc visually shrinks as time passes — ideal for Pomodoro technique with ADHD. No ticking, no anxiety. Recommended by occupational therapists.',
    },
    category: 'accessibility',
    subcategory: 'timers',
    tier: 'budget',
    priceRange: '€30-45',
    recommended: true,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B08K9FG8Y7',
      en: 'https://www.amazon.co.uk/dp/B0CKPGLNHZ',
    },
    image: '/gear/time-timer-mod.webp',
  },
  {
    id: 'pilpoc-fidget-cube',
    name: { es: 'PILPOC theFube Fidget Cube', en: 'PILPOC theFube Fidget Cube' },
    description: {
      es: 'Cubo fidget con 4 lados silenciosos y 2 con click. Diseño premium con funda protectora incluida. Ayuda a mantener el foco durante sesiones de edición largas. Específicamente diseñado para TDAH, ansiedad y autismo.',
      en: 'Fidget cube with 4 silent sides and 2 clicky ones. Premium design with protective case included. Helps maintain focus during long editing sessions. Specifically designed for ADHD, anxiety, and autism.',
    },
    category: 'accessibility',
    subcategory: 'fidget-tools',
    tier: 'budget',
    priceRange: '€15-25',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B09VLHSXX1',
      en: 'https://www.amazon.co.uk/dp/B0C3BJ8L3B',
    },
    image: '/gear/pilpoc-fidget-cube.webp',
  },
  {
    id: 'elgato-key-light-accessibility',
    name: { es: 'Elgato Key Light (Confort Sensorial)', en: 'Elgato Key Light (Sensory Comfort)' },
    description: {
      es: 'Control de temperatura e intensidad desde el móvil. Para personas con sensibilidad sensorial, poder ajustar la luz con precisión sin levantarte elimina una fuente constante de incomodidad. Temperatura regulable de 2900K a 7000K.',
      en: 'Temperature and intensity control from your phone. For people with sensory sensitivity, being able to precisely adjust light without getting up eliminates a constant source of discomfort. Adjustable temperature from 2900K to 7000K.',
    },
    category: 'accessibility',
    tier: 'mid',
    priceRange: '€170-200',
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B07L755X9G',
      en: 'https://www.amazon.co.uk/dp/B07L755X9G',
    },
    image: '/gear/elgato-key-light.png',
  },
  {
    id: 'sensory-owl-body-sock',
    name: { es: 'Sensory Owl Calcetín Corporal', en: 'Sensory Owl Body Sock' },
    description: {
      es: 'Calcetín de cuerpo entero que proporciona estimulación de presión profunda. Alivia estrés y ansiedad en personas con TDAH y autismo. Terapia sensorial que ayuda a la concentración durante sesiones de trabajo largas.',
      en: 'Full body sock providing deep pressure stimulation. Relieves stress and anxiety in people with ADHD and autism. Sensory therapy that helps concentration during long work sessions.',
    },
    category: 'accessibility',
    subcategory: 'deep-pressure',
    tier: 'budget',
    priceRange: '€20-35',
    amazonUrl: {
      es: 'https://amzn.eu/d/06gWy0Kj',
      en: 'https://amzn.eu/d/06gWy0Kj',
    },
    image: '/gear/Calcetín-Cuerpo-Entero-TDAH.webp',
  },
  {
    id: 'magnetic-fidget-sliders',
    name: { es: 'Fidget Magnético Slider 8 piezas', en: 'Magnetic Fidget Slider 8-Pack' },
    description: {
      es: 'Set de 8 sliders y spinners magnéticos metálicos. Silenciosos, ideales para usar en clase o la oficina sin molestar. Ayudan a canalizar la energía nerviosa y mantener el foco con TDAH y autismo.',
      en: '8-piece magnetic metal slider and spinner set. Silent, ideal for class or office without disturbing others. Helps channel nervous energy and maintain focus with ADHD and autism.',
    },
    category: 'accessibility',
    subcategory: 'fidget-tools',
    tier: 'budget',
    priceRange: '€10-18',
    amazonUrl: {
      es: 'https://amzn.eu/d/0ia8QwVd',
      en: 'https://amzn.eu/d/0ia8QwVd',
    },
    image: '/gear/8-Piezas-Juguete-Fidget.webp',
  },
  {
    id: 'vcostore-fidget-cube',
    name: { es: 'VCOSTORE Cubo Fidget 12 Caras', en: 'VCOSTORE 12-Side Fidget Cube' },
    description: {
      es: 'Cubo antiestrés portátil con 12 caras de estimulación diferentes. Compacto para llevar a cualquier parte. Para niños y adultos con TDAH, TOC o ansiedad que necesitan mantener las manos ocupadas mientras crean.',
      en: 'Portable stress cube with 12 different stimulation sides. Compact to carry anywhere. For kids and adults with ADHD, OCD or anxiety who need to keep hands busy while creating.',
    },
    category: 'accessibility',
    subcategory: 'fidget-tools',
    tier: 'budget',
    priceRange: '€8-12',
    amazonUrl: {
      es: 'https://amzn.eu/d/0hRs6kia',
      en: 'https://amzn.eu/d/0hRs6kia',
    },
    image: '/gear/VCOSTORE-Stress-Cube-12-Caras.webp',
  },
  {
    id: 'odoxia-weighted-lap-pad',
    name: { es: 'ODOXIA Cojín de Regazo con Lastre', en: 'ODOXIA Weighted Lap Pad' },
    description: {
      es: 'Cojín de regazo de 2 kg con forma de perro. Proporciona presión reconfortante que calma el sistema nervioso. Perfecto para sesiones de edición — la presión constante ayuda a mantener la calma y el foco con autismo, TDAH o ansiedad.',
      en: '2kg weighted lap pad shaped like a dog. Provides comforting pressure that calms the nervous system. Perfect for editing sessions — constant pressure helps maintain calm and focus with autism, ADHD or anxiety.',
    },
    category: 'accessibility',
    subcategory: 'deep-pressure',
    tier: 'budget',
    priceRange: '€25-35',
    amazonUrl: {
      es: 'https://amzn.eu/d/041KIc40',
      en: 'https://amzn.eu/d/041KIc40',
    },
    image: '/gear/ODOXIA-Cojín-Regazo-con-Lastre.webp',
  },
  {
    id: 'good-nite-weighted-blanket',
    name: { es: 'Good Nite Manta con Peso 8 kg', en: 'Good Nite Weighted Blanket 8kg' },
    description: {
      es: 'Manta ponderada de 8 kg (150x200 cm) para aliviar estrés y mejorar el sueño. La presión profunda simula un abrazo constante que calma la ansiedad. Esencial para creadores que luchan con el insomnio post-trabajo.',
      en: '8kg weighted blanket (150x200 cm) to relieve stress and improve sleep. Deep pressure simulates a constant hug that calms anxiety. Essential for creators struggling with post-work insomnia.',
    },
    category: 'accessibility',
    subcategory: 'deep-pressure',
    tier: 'mid',
    priceRange: '€40-55',
    amazonUrl: {
      es: 'https://amzn.eu/d/022WCZ27',
      en: 'https://amzn.eu/d/022WCZ27',
    },
    image: '/gear/Manta-con-Peso.webp',
  },
  {
    id: 'qucover-cooling-blanket',
    name: { es: 'Qucover Manta Refrescante Verano', en: 'Qucover Cooling Summer Blanket' },
    description: {
      es: 'Manta con tecnología japonesa ARC-Chill (Q-MAX>0.5) que se siente fría al tacto. Ideal para combinar con manta ponderada en verano o para personas con sensibilidad térmica. Transpirable y reversible, 150x200 cm.',
      en: 'Blanket with Japanese ARC-Chill technology (Q-MAX>0.5) that feels cold to the touch. Ideal to combine with weighted blanket in summer or for people with thermal sensitivity. Breathable and reversible, 150x200 cm.',
    },
    category: 'accessibility',
    subcategory: 'deep-pressure',
    tier: 'budget',
    priceRange: '€25-35',
    amazonUrl: {
      es: 'https://amzn.eu/d/00DSMZrR',
      en: 'https://amzn.eu/d/00DSMZrR',
    },
    image: '/gear/Qucover-Manta-Refrescante.webp',
  },
  {
    id: 'bose-qc-ultra-earbuds-2',
    name: { es: 'Bose QC Ultra Earbuds 2ª Gen', en: 'Bose QC Ultra Earbuds 2nd Gen' },
    description: {
      es: 'Auriculares in-ear con la mejor cancelación de ruido del mercado. Audio inmersivo con graves profundos, IPX4, hasta 6h de batería. Para creadores que prefieren in-ear frente a over-ear para bloquear estímulos sensoriales.',
      en: 'In-ear headphones with the best noise cancellation on the market. Immersive audio with deep bass, IPX4, up to 6h battery. For creators who prefer in-ear over over-ear to block sensory stimuli.',
    },
    category: 'accessibility',
    subcategory: 'noise-cancelling',
    tier: 'pro',
    priceRange: '€250-300',
    amazonUrl: {
      es: 'https://amzn.eu/d/0fy62C6u',
      en: 'https://amzn.eu/d/0fy62C6u',
    },
    image: '/gear/Bose-Auriculares-boton.webp',
  },
  {
    id: 'sony-wf1000xm5',
    name: { es: 'Sony WF-1000XM5 In-Ear', en: 'Sony WF-1000XM5 In-Ear' },
    description: {
      es: 'Auriculares inalámbricos in-ear con cancelación de ruido líder. Bluetooth, micrófono, 24h de batería con estuche, carga rápida, IPX4. La alternativa in-ear a los WH-1000XM5 para quien necesita máxima portabilidad y discreción.',
      en: 'Wireless in-ear headphones with leading noise cancellation. Bluetooth, mic, 24h battery with case, fast charging, IPX4. The in-ear alternative to WH-1000XM5 for those needing maximum portability and discretion.',
    },
    category: 'accessibility',
    subcategory: 'noise-cancelling',
    tier: 'pro',
    priceRange: '€220-280',
    recommended: true,
    amazonUrl: {
      es: 'https://amzn.eu/d/0idxogNS',
      en: 'https://amzn.eu/d/0idxogNS',
    },
    image: '/gear/Auriculares-inalambricos-Noise-Cancelling.webp',
  },
  {
    id: 'soundcore-space-q45',
    name: { es: 'Soundcore Space Q45', en: 'Soundcore Space Q45' },
    description: {
      es: 'Cascos over-ear con cancelación de ruido adaptativa (98% reducción). 50h de batería, LDAC Hi-Res, app de control, Bluetooth 5.3. Alternativa asequible a Sony/Bose con excelente cancelación para sensibilidad sensorial.',
      en: 'Over-ear headphones with adaptive noise cancellation (98% reduction). 50h battery, LDAC Hi-Res, control app, Bluetooth 5.3. Affordable alternative to Sony/Bose with excellent cancellation for sensory sensitivity.',
    },
    category: 'accessibility',
    subcategory: 'noise-cancelling',
    tier: 'mid',
    priceRange: '€80-110',
    recommended: true,
    amazonUrl: {
      es: 'https://amzn.eu/d/0bZCq6NT',
      en: 'https://amzn.eu/d/0bZCq6NT',
    },
    image: '/gear/Soundcore-Anker-Space-Q45.webp',
  },
  {
    id: 'chair-resistance-bands',
    name: { es: 'Bandas Elásticas para Sillas (5 uds)', en: 'Chair Resistance Bands (5-Pack)' },
    description: {
      es: 'Set de 5 bandas elásticas para enganchar a las patas de la silla. Permiten mover los pies mientras trabajas sin molestar. Canalizan la necesidad de movimiento en TDAH y autismo de forma discreta y silenciosa.',
      en: '5-pack elastic bands to attach to chair legs. Allow moving your feet while working without disturbing others. Channel the need for movement in ADHD and autism discreetly and silently.',
    },
    category: 'accessibility',
    subcategory: 'movement',
    tier: 'budget',
    priceRange: '€8-14',
    amazonUrl: {
      es: 'https://amzn.eu/d/074XROyr',
      en: 'https://amzn.eu/d/074XROyr',
    },
    image: '/gear/Bandas-Sensoriales.webp',
  },
  {
    id: 'tilcare-chew-pendant',
    name: { es: 'Tilcare Colgante Masticable', en: 'Tilcare Chew Pendant' },
    description: {
      es: 'Colgante de silicona segura para morder, ideal para niños y adultos que necesitan estimulación oral. Discreto como accesorio, ayuda a reducir ansiedad y mejorar la concentración en personas con autismo o TDAH.',
      en: 'Safe silicone chew pendant for children and adults who need oral stimulation. Discreet as an accessory, helps reduce anxiety and improve focus in people with autism or ADHD.',
    },
    category: 'accessibility',
    subcategory: 'fidget-tools',
    tier: 'budget',
    priceRange: '€8-15',
    amazonUrl: {
      es: 'https://amzn.eu/d/08IO7z6x',
      en: 'https://amzn.eu/d/08IO7z6x',
    },
    image: '/gear/Tilcare-Chew-Chew.webp',
  },
  {
    id: 'yadoca-anxiety-ring',
    name: { es: 'YADOCA Anillo Giratorio Anti-Ansiedad', en: 'YADOCA Anxiety Spinner Ring' },
    description: {
      es: 'Anillo de plata de ley 925 con cuentas giratorias. Discreto, elegante, perfecto para girar con el pulgar durante reuniones o sesiones de grabación. Alivia ansiedad sin llamar la atención.',
      en: 'Sterling silver 925 ring with spinning beads. Discreet, elegant, perfect for thumb-spinning during meetings or recording sessions. Relieves anxiety without drawing attention.',
    },
    category: 'accessibility',
    subcategory: 'wearables-rings',
    tier: 'budget',
    priceRange: '€12-20',
    amazonUrl: {
      es: 'https://amzn.eu/d/0fDkdfPE',
      en: 'https://amzn.eu/d/0fDkdfPE',
    },
    image: '/gear/YADOCA-925-Anillos.webp',
  },
  {
    id: 'ringconn-gen2-air',
    name: { es: 'RingConn Gen 2 Air Smart Ring', en: 'RingConn Gen 2 Air Smart Ring' },
    description: {
      es: 'Anillo inteligente ultrafino que monitoriza sueño, frecuencia cardíaca y niveles de estrés. 10 días de autonomía. Ayuda a creadores neurodivergentes a detectar patrones de estrés y optimizar sus rutinas de trabajo.',
      en: 'Ultra-thin smart ring monitoring sleep, heart rate and stress levels. 10-day battery life. Helps neurodivergent creators detect stress patterns and optimize their work routines.',
    },
    category: 'accessibility',
    subcategory: 'wearables-rings',
    tier: 'pro',
    priceRange: '€250-300',
    amazonUrl: {
      es: 'https://amzn.eu/d/0dnn7xqd',
      en: 'https://amzn.eu/d/0dnn7xqd',
    },
    image: '/gear/RingConn-Gen-2.webp',
  },
  {
    id: 'yogi-fidget-spinner',
    name: { es: 'Yogi Spinner Antiestrés', en: 'Yogi Anti-Stress Spinner' },
    description: {
      es: 'Spinner de anillos con cinco tamaños. Silencioso, metálico y satisfactorio al tacto. Alivia ansiedad y ayuda con el foco en TDAH y autismo. Diseño discreto para usar en cualquier contexto profesional.',
      en: 'Ring spinner with five sizes. Silent, metallic and satisfying to touch. Relieves anxiety and helps with focus in ADHD and autism. Discreet design for any professional context.',
    },
    category: 'accessibility',
    subcategory: 'fidget-tools',
    tier: 'budget',
    priceRange: '€10-18',
    amazonUrl: {
      es: 'https://amzn.eu/d/03mY8IX0',
      en: 'https://amzn.eu/d/03mY8IX0',
    },
    image: '/gear/Yogi-Juguete-Antiestres.webp',
  },
  {
    id: 'twr-proprioceptive-roller',
    name: { es: 'TWR Tronco Propioceptivo 5P', en: 'TWR Proprioceptive Roller 5P' },
    description: {
      es: 'Woodroller de madera natural fabricado en España (49,5x17x7,5 cm). Para ejercicios hipopresivos, pilates y eutonía. Mejora la conciencia corporal y reduce tensión acumulada de largas sesiones frente al ordenador.',
      en: 'Natural wood roller made in Spain (49.5x17x7.5 cm). For hypopressive exercises, pilates and eutony. Improves body awareness and reduces tension from long computer sessions.',
    },
    category: 'accessibility',
    subcategory: 'movement',
    tier: 'mid',
    priceRange: '€35-50',
    amazonUrl: {
      es: 'https://amzn.eu/d/08oGd0XJ',
      en: 'https://amzn.eu/d/08oGd0XJ',
    },
    image: '/gear/Tronco-Propioceptivo.webp',
  },
  {
    id: 'scione-fidget-spinner',
    name: { es: 'SCIONE Fidget Spinner Sensorial', en: 'SCIONE Sensory Fidget Spinner' },
    description: {
      es: 'Spinner clásico de alta calidad con giro suave y duradero. Juguete sensorial para aliviar estrés y ansiedad. Ideal como regalo o como herramienta de foco para sesiones de brainstorming y edición.',
      en: 'Classic high-quality spinner with smooth, lasting spin. Sensory toy to relieve stress and anxiety. Ideal as a gift or focus tool for brainstorming and editing sessions.',
    },
    category: 'accessibility',
    subcategory: 'fidget-tools',
    tier: 'budget',
    priceRange: '€8-12',
    amazonUrl: {
      es: 'https://amzn.eu/d/0dzZ8qpR',
      en: 'https://amzn.eu/d/0dzZ8qpR',
    },
    image: '/gear/SCIONE-Fidget.webp',
  },
  {
    id: 'eoocoo-visual-timer',
    name: { es: 'EooCoo Temporizador Visual Digital', en: 'EooCoo Digital Visual Timer' },
    description: {
      es: 'Temporizador visual de 60 min con cuenta atrás, cronómetro y alarma. Función silencio/sonido configurable. Alternativa digital al Time Timer clásico — pantalla clara, compacto, ideal para Pomodoro con TDAH.',
      en: '60-min visual timer with countdown, stopwatch and alarm. Configurable silent/sound mode. Digital alternative to the classic Time Timer — clear display, compact, ideal for Pomodoro with ADHD.',
    },
    category: 'accessibility',
    subcategory: 'timers',
    tier: 'budget',
    priceRange: '€15-22',
    amazonUrl: {
      es: 'https://amzn.eu/d/096xXum0',
      en: 'https://amzn.eu/d/096xXum0',
    },
    image: '/gear/EooCoo-Temporizador.webp',
  },
  {
    id: 'diamday-spinner-ring',
    name: { es: 'Diamday Anillo Giratorio Luna y Estrella', en: 'Diamday Moon & Star Spinner Ring' },
    description: {
      es: 'Anillo de acero inoxidable con diseño de luna y estrella giratorio. Alivia estrés y ansiedad de forma discreta. Bonito diseño unisex que funciona como joya y herramienta de autorregulación a la vez.',
      en: 'Stainless steel ring with spinning moon and star design. Relieves stress and anxiety discreetly. Beautiful unisex design that works as both jewelry and a self-regulation tool.',
    },
    category: 'accessibility',
    subcategory: 'wearables-rings',
    tier: 'budget',
    priceRange: '€10-16',
    amazonUrl: {
      es: 'https://amzn.eu/d/0c9KIxRP',
      en: 'https://amzn.eu/d/0c9KIxRP',
    },
    image: '/gear/Diamday-Anillos-Giratorios.webp',
  },
];

export const TIER_LABELS: Record<string, { es: string; en: string }> = {
  budget: { es: 'Principiante', en: 'Budget' },
  mid:    { es: 'Intermedio',   en: 'Mid-range' },
  pro:    { es: 'Profesional',  en: 'Professional' },
};

export const TIER_COLORS: Record<string, string> = {
  budget: '#22c55e',
  mid:    '#FFE800',
  pro:    '#e84d5b',
};
