export type Lang = 'es' | 'en';

export interface GearItem {
  id: string;
  name: { es: string; en: string };
  description: { es: string; en: string };
  category: string;
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
];

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
    image: 'https://m.media-amazon.com/images/I/61tukvVUMiL._AC_SL1500_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/81ww9NIIRRL._AC_SL1500_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/61plU2NSrEL._AC_SL1500_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/81OmG6409ML._AC_SL1500_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/61ElAcEsHiL._AC_SL1080_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/81SkpwyPZnL._AC_SL1500_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/51Wvs2GxZ1L._AC_SL1000_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/71DZvCEIFOL._AC_SL1500_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/617mzv+iKjL._AC_SL1500_.jpg',
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
      es: 'https://www.amazon.es/dp/B0743Z892W',
      en: 'https://www.amazon.co.uk/dp/B0743Z892W',
    },
    image: 'https://m.media-amazon.com/images/I/61GlaHCM85L._AC_SL1500_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/519TvRDJyYL._AC_SL1080_.jpg',
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
    image: 'https://m.media-amazon.com/images/I/A1sHjPpz6fL._AC_SL1500_.jpg',
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
    image: 'https://cdn.manfrotto.com/media/catalog/product/cache/16a7253a27a4188a5cc006d92677ae2a/m/t/mtpixi-b-v4.jpg',
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
    image: 'https://m.media-amazon.com/images/I/61e306LgiuL._AC_SL1438_.jpg',
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
    image: 'https://cdn11.bigcommerce.com/s-7exlzlf13h/images/stencil/1280x1280/products/307/785/scarlett-2i2-top-image-2400-2400__78159.1693324453.png',
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
    image: 'https://www.apple.com/v/macbook-air/z/images/overview/design/design_hero_static__e56c1v71mr6u_large.png',
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
    image: 'https://www.apple.com/v/macbook-pro/ax/images/overview/product-viewer/pv_hero_endframe__gc89p7dw1syi_large.jpg',
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
    image: 'https://i.dell.com/is/image/DellContent//content/dam/ss2/product-images/dell-client-products/peripherals/monitors/s-series/s2722qc/spi/ng/monitor-s2722qc-relsize-500-ng.psd?fmt=jpg&wid=500&hei=381',
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
    image: 'https://resource.logitech.com/c_fill,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/mice/mx-master-3s/2025-update/mx-master-3s-bluetooth-edition-top-view-black-new-1.png',
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
    image: 'https://resource.logitech.com/w_544,h_466,ar_7:6,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/keyboards/mx-keys-s/migration-assets-for-delorean-2025/gallery/mx-keys-s-top-view-black-us.png',
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
    image: 'https://m.media-amazon.com/images/I/61gtdFnK+UL._AC_SL1500_.jpg',
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
    image: 'https://images.blackmagicdesign.com/images/products/davinciresolve/product-grid/davinci-resolve-speed-editor.jpg',
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
