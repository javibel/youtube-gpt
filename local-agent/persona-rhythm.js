'use strict';

// PERSONA RHYTHM — azar con inteligencia.
//
// El azar uniforme también es un patrón: 4 cuentas que se activan en la misma
// ventana de cron, cada una con un retardo plano, son estadísticamente un bot.
// Los humanos son IRREGULARES CON SENTIDO: cada uno tiene sus horas, sus días
// flojos, su ritmo propio anclado a su vida.
//
// Cada persona tiene:
//   - un perfil horario (probabilidad de "ahora me apetece mirar Bluesky" por hora)
//   - un estado de ánimo diario (multiplicador 0.4–1.3, estable dentro del día,
//     derivado de un hash de fecha+id → algunos días simplemente no aparece)
//
// El dispatcher corre cada hora (08–23 Madrid) y para cada persona tira el dado
// con SU peso de ESA hora × su ánimo del día. Resultado: actividad repartida por
// el día, distinta por persona, con bursts y huecos como una persona real.

// Pesos horarios por persona (índice = hora local 0–23). Valores bajos a propósito:
// el objetivo es ~1–2 sesiones por persona y día, no actividad constante.
const HOURLY = {
  // Alex — editor freelance, búho. Arranca tarde, pico noche.
  'persona-alex': [
    0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.04, 0.06, 0.07,
    0.06, 0.05, 0.05, 0.06, 0.08, 0.10, 0.12, 0.15, 0.18, 0.16, 0.12, 0.06,
  ],
  // Ferran — consultor marketing, horario de oficina. Picos 9–13 y 16–18.
  'persona-ferran': [
    0, 0, 0, 0, 0, 0, 0, 0.02, 0.08, 0.16, 0.18, 0.15,
    0.10, 0.06, 0.08, 0.14, 0.16, 0.13, 0.07, 0.04, 0.03, 0.02, 0.01, 0,
  ],
  // Ana — community manager, todo el día a ratos. Reparto amplio, sin pico fuerte.
  'persona-ana': [
    0, 0, 0, 0, 0, 0, 0, 0.03, 0.07, 0.10, 0.11, 0.10,
    0.09, 0.08, 0.09, 0.10, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06, 0.04, 0.02,
  ],
  // Mayra — copywriter, de mañanas. Pico claro 8–12, tarde floja.
  'persona-mayra': [
    0, 0, 0, 0, 0, 0, 0.02, 0.06, 0.16, 0.18, 0.16, 0.13,
    0.08, 0.05, 0.04, 0.04, 0.05, 0.05, 0.04, 0.03, 0.02, 0.02, 0.01, 0,
  ],
};

const DEFAULT_HOURLY = HOURLY['persona-ana'];

// Hash determinista (fecha + id) → 0..1. Estable dentro del mismo día, cambia
// cada día. Sin I/O ni estado: el "ánimo" se recalcula solo a medianoche.
function dailySeed(personaId) {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD
  const str = `${day}:${personaId}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000; // 0..1
}

// Ánimo del día: 0.4–1.3. ~15% de los días cae por debajo de 0.55 → persona casi
// ausente ese día (días flojos, como un humano real).
function moodMultiplier(personaId) {
  return 0.4 + dailySeed(personaId) * 0.9;
}

function hourMadrid() {
  return new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }) | 0;
}

// ¿Debe esta persona engancharse en este momento?
// Combina el peso de la hora actual con el ánimo del día.
function shouldEngageNow(personaId, hour = hourMadrid()) {
  const weights = HOURLY[personaId] || DEFAULT_HOURLY;
  const base = weights[hour] || 0;
  if (base <= 0) return false;
  const p = base * moodMultiplier(personaId);
  return Math.random() < p;
}

// Diagnóstico: probabilidad efectiva de cada persona ahora (para logs/dashboard).
function snapshot(hour = hourMadrid()) {
  const out = {};
  for (const id of Object.keys(HOURLY)) {
    const base = (HOURLY[id] || DEFAULT_HOURLY)[hour] || 0;
    out[id] = +(base * moodMultiplier(id)).toFixed(3);
  }
  return { hour, probabilities: out };
}

module.exports = { shouldEngageNow, moodMultiplier, snapshot, hourMadrid };
