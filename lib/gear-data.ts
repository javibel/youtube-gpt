export type Lang = 'es' | 'en';

export interface GearItem {
  id: string;
  name: { es: string; en: string };
  description: { es: string; en: string };
  category: string;
  tier: 'budget' | 'mid' | 'pro';
  priceRange: string;
  recommended?: boolean;
  amazonTag: string; // affiliate tag appended to URL
  amazonUrl: { es: string; en: string }; // base Amazon product URL (without tag)
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
  { key: 'software',     name: { es: 'Software',      en: 'Software' },      icon: '💻', color: '#B388FF' },
];

// Amazon affiliate tag — replace with your real tag
const TAG_ES = 'ytubviral-21';
const TAG_EN = 'ytubviral-20';

export const GEAR_ITEMS: GearItem[] = [
  // ── Cameras ──────────────────────────────────────────────────────
  {
    id: 'sony-zv1f',
    name: { es: 'Sony ZV-1F', en: 'Sony ZV-1F' },
    description: {
      es: 'La cámara perfecta para empezar en YouTube. Compacta, autofoco rápido, micrófono integrado decente y pantalla abatible. Ideal para vlogs y contenido en movimiento.',
      en: 'The perfect camera to start on YouTube. Compact, fast autofocus, decent built-in mic, and flip screen. Ideal for vlogs and on-the-go content.',
    },
    category: 'cameras',
    tier: 'budget',
    priceRange: '€400-500',
    recommended: true,
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0BHKL2BRM',
      en: 'https://www.amazon.com/dp/B0BHKL2BRM',
    },
  },
  {
    id: 'sony-zv-e10ii',
    name: { es: 'Sony ZV-E10 II', en: 'Sony ZV-E10 II' },
    description: {
      es: 'Mirrorless con lentes intercambiables a precio razonable. Sensor APS-C, 4K, estabilización y product showcase mode. El siguiente paso natural desde la ZV-1F.',
      en: 'Mirrorless with interchangeable lenses at a reasonable price. APS-C sensor, 4K, stabilization and product showcase mode. The natural next step from the ZV-1F.',
    },
    category: 'cameras',
    tier: 'mid',
    priceRange: '€800-1000',
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0D79H2Q3Y',
      en: 'https://www.amazon.com/dp/B0D79H2Q3Y',
    },
  },
  {
    id: 'sony-a7iv',
    name: { es: 'Sony A7 IV', en: 'Sony A7 IV' },
    description: {
      es: 'Full frame de referencia. 33MP, 4K 60fps, autofoco de rastreo ocular en tiempo real. La cámara que usan los YouTubers profesionales. Inversión seria, resultados serios.',
      en: 'Reference full frame. 33MP, 4K 60fps, real-time eye tracking autofocus. The camera pro YouTubers use. Serious investment, serious results.',
    },
    category: 'cameras',
    tier: 'pro',
    priceRange: '€2200-2600',
    recommended: true,
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B09JZT6YK5',
      en: 'https://www.amazon.com/dp/B09JZT6YK5',
    },
  },

  // ── Microphones ──────────────────────────────────────────────────
  {
    id: 'rode-nt-usb-mini',
    name: { es: 'Rode NT-USB Mini', en: 'Rode NT-USB Mini' },
    description: {
      es: 'Micrófono USB de condensador compacto. Plug & play, sin necesidad de interfaz de audio. Calidad sorprendente para su precio. Perfecto para empezar.',
      en: 'Compact USB condenser microphone. Plug & play, no audio interface needed. Surprising quality for its price. Perfect to get started.',
    },
    category: 'microphones',
    tier: 'budget',
    priceRange: '€80-100',
    recommended: true,
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B084P1CXFD',
      en: 'https://www.amazon.com/dp/B084P1CXFD',
    },
  },
  {
    id: 'rode-podmic-usb',
    name: { es: 'Rode PodMic USB', en: 'Rode PodMic USB' },
    description: {
      es: 'Dinámico con conexión USB y XLR. Rechaza ruido ambiental, voz potente y clara. Ideal para podcasts, streaming y narración de vídeos.',
      en: 'Dynamic with USB and XLR connection. Rejects ambient noise, powerful and clear voice. Ideal for podcasts, streaming, and video narration.',
    },
    category: 'microphones',
    tier: 'mid',
    priceRange: '€100-130',
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0BJ4Q3514',
      en: 'https://www.amazon.com/dp/B0BJ4Q3514',
    },
  },
  {
    id: 'shure-sm7db',
    name: { es: 'Shure SM7dB', en: 'Shure SM7dB' },
    description: {
      es: 'La evolución del legendario SM7B con preamplificador integrado. El micrófono de podcasting y YouTube por excelencia. Usado por los mejores creadores del mundo.',
      en: 'The evolution of the legendary SM7B with built-in preamp. The podcasting and YouTube microphone par excellence. Used by the world\'s best creators.',
    },
    category: 'microphones',
    tier: 'pro',
    priceRange: '€400-500',
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0CXLHKL3Q',
      en: 'https://www.amazon.com/dp/B0CXLHKL3Q',
    },
  },

  // ── Lighting ─────────────────────────────────────────────────────
  {
    id: 'neewer-660',
    name: { es: 'Neewer 660 LED Panel', en: 'Neewer 660 LED Panel' },
    description: {
      es: 'Panel LED bicolor (3200-5600K) con trípode incluido. Regulable, ligero y asequible. Dos paneles transforman cualquier habitación en un mini estudio.',
      en: 'Bi-color LED panel (3200-5600K) with tripod included. Dimmable, lightweight, and affordable. Two panels transform any room into a mini studio.',
    },
    category: 'lighting',
    tier: 'budget',
    priceRange: '€60-80',
    recommended: true,
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B07T8FBZC2',
      en: 'https://www.amazon.com/dp/B07T8FBZC2',
    },
  },
  {
    id: 'elgato-key-light',
    name: { es: 'Elgato Key Light', en: 'Elgato Key Light' },
    description: {
      es: 'Control desde el móvil o PC, 2500 lúmenes, temperatura ajustable. Se monta con brazo de escritorio (no ocupa suelo). El estándar de la industria para streamers y YouTubers.',
      en: 'Control from phone or PC, 2500 lumens, adjustable temperature. Mounts with desk arm (no floor space). The industry standard for streamers and YouTubers.',
    },
    category: 'lighting',
    tier: 'pro',
    priceRange: '€170-200',
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B07L755X9G',
      en: 'https://www.amazon.com/dp/B07L755X9G',
    },
  },

  // ── Accessories ──────────────────────────────────────────────────
  {
    id: 'elgato-green-screen',
    name: { es: 'Elgato Green Screen', en: 'Elgato Green Screen' },
    description: {
      es: 'Chroma key retráctil que se despliega en segundos y se recoge sin arrugas. Imprescindible para thumbnails, efectos y fondos virtuales.',
      en: 'Retractable chroma key that deploys in seconds and retracts wrinkle-free. Essential for thumbnails, effects, and virtual backgrounds.',
    },
    category: 'accessories',
    tier: 'mid',
    priceRange: '€130-160',
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0743Z892W',
      en: 'https://www.amazon.com/dp/B0743Z892W',
    },
  },
  {
    id: 'rode-wireless-go-ii',
    name: { es: 'Rode Wireless Go II', en: 'Rode Wireless Go II' },
    description: {
      es: 'Sistema inalámbrico dual: 2 transmisores + 1 receptor. Grabación interna de respaldo. Alcance 200m. Perfecto para entrevistas, exteriores y vlogs.',
      en: 'Dual wireless system: 2 transmitters + 1 receiver. Internal backup recording. 200m range. Perfect for interviews, outdoors, and vlogs.',
    },
    category: 'accessories',
    tier: 'mid',
    priceRange: '€250-300',
    recommended: true,
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B08ZH2SNG8',
      en: 'https://www.amazon.com/dp/B08ZH2SNG8',
    },
  },
  {
    id: 'samsung-t7',
    name: { es: 'Samsung T7 SSD 1TB', en: 'Samsung T7 SSD 1TB' },
    description: {
      es: 'SSD externo ultrarrápido (1050 MB/s). Compacto y resistente. Imprescindible para edición de vídeo 4K sin lag. No más "disco lleno" en mitad de una sesión.',
      en: 'Ultrafast external SSD (1050 MB/s). Compact and durable. Essential for lag-free 4K video editing. No more "disk full" mid-session.',
    },
    category: 'accessories',
    tier: 'budget',
    priceRange: '€80-110',
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0874XN4D8',
      en: 'https://www.amazon.com/dp/B0874XN4D8',
    },
  },
  {
    id: 'manfrotto-pixi',
    name: { es: 'Manfrotto PIXI Mini Tripod', en: 'Manfrotto PIXI Mini Tripod' },
    description: {
      es: 'Mini trípode de mesa robusto y elegante. Se abre con una mano, aguanta cámaras mirrorless sin problema. Perfecto para escritorio o viajes.',
      en: 'Robust and elegant mini tabletop tripod. Opens with one hand, holds mirrorless cameras without issue. Perfect for desk or travel.',
    },
    category: 'accessories',
    tier: 'budget',
    priceRange: '€25-35',
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B00D76RNLS',
      en: 'https://www.amazon.com/dp/B00D76RNLS',
    },
  },

  // ── Audio ────────────────────────────────────────────────────────
  {
    id: 'beyerdynamic-dt770',
    name: { es: 'Beyerdynamic DT 770 Pro', en: 'Beyerdynamic DT 770 Pro' },
    description: {
      es: 'Auriculares cerrados de estudio. Confort extremo para sesiones largas de edición. Sonido neutro y detallado. Los favoritos de editores de vídeo y música.',
      en: 'Closed-back studio headphones. Extreme comfort for long editing sessions. Neutral and detailed sound. Favorites of video and music editors.',
    },
    category: 'audio',
    tier: 'mid',
    priceRange: '€130-160',
    recommended: true,
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B0016MNAAI',
      en: 'https://www.amazon.com/dp/B0016MNAAI',
    },
  },
  {
    id: 'focusrite-scarlett-solo',
    name: { es: 'Focusrite Scarlett Solo', en: 'Focusrite Scarlett Solo' },
    description: {
      es: 'Interfaz de audio USB compacta. Preamplificador de calidad profesional. Si usas micrófono XLR, esta es la conexión entre tu micro y tu PC.',
      en: 'Compact USB audio interface. Professional-quality preamp. If you use an XLR microphone, this is the bridge between your mic and your PC.',
    },
    category: 'audio',
    tier: 'mid',
    priceRange: '€100-130',
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B07QR6Z1JB',
      en: 'https://www.amazon.com/dp/B07QR6Z1JB',
    },
  },

  // ── Software ─────────────────────────────────────────────────────
  {
    id: 'davinci-resolve',
    name: { es: 'DaVinci Resolve (Speed Editor)', en: 'DaVinci Resolve (Speed Editor)' },
    description: {
      es: 'El software de edición es gratis, pero el Speed Editor acelera tu flujo. Cortes rápidos con jog wheel, teclas dedicadas para trimming. Ideal si editas a diario.',
      en: 'The editing software is free, but the Speed Editor accelerates your workflow. Quick cuts with jog wheel, dedicated trimming keys. Ideal if you edit daily.',
    },
    category: 'software',
    tier: 'mid',
    priceRange: '€300-400',
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B08LDFNFWJ',
      en: 'https://www.amazon.com/dp/B08LDFNFWJ',
    },
  },
  {
    id: 'elgato-stream-deck',
    name: { es: 'Elgato Stream Deck MK.2', en: 'Elgato Stream Deck MK.2' },
    description: {
      es: '15 teclas LCD programables. Atajos para OBS, cambio de escenas, efectos de sonido, control de luces. Transforma tu setup en un centro de producción profesional.',
      en: '15 programmable LCD keys. Shortcuts for OBS, scene switching, sound effects, light control. Transforms your setup into a professional production center.',
    },
    category: 'software',
    tier: 'mid',
    priceRange: '€130-160',
    recommended: true,
    amazonTag: TAG_ES,
    amazonUrl: {
      es: 'https://www.amazon.es/dp/B09738CJVN',
      en: 'https://www.amazon.com/dp/B09738CJVN',
    },
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
