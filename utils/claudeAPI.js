import { TEMPLATES } from './prompts';

// Timeout duro de generación (E1 #3). Scripts largos con maxTokens 8192 pueden
// tardar 60-90s — no bajar de 90s o se abortarían generaciones legítimas.
const GENERATION_TIMEOUT_MS = 90_000;

async function fetchWithTimeout(url, options, lang) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error(lang === 'en'
        ? 'The generation took too long and was cancelled. Please try again.'
        : 'La generación tardó demasiado y se canceló. Inténtalo de nuevo.');
      err.timedOut = true;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function callClaudeAPI(template, inputs, lang = 'es') {
  const templateData = TEMPLATES[template];
  if (!templateData) {
    throw new Error('Template no válido');
  }

  const response = await fetchWithTimeout('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template, inputs, lang }),
  }, lang);

  if (!response.ok) {
    const error = await response.json();
    const err = new Error(error.error || 'Error al generar contenido');
    if (error.limitReached) err.limitReached = true;
    throw err;
  }

  const data = await response.json();
  return { content: data.content, truncated: !!data.truncated };
}

/**
 * Continue a truncated generation — sends the previous content
 * so Claude picks up where it left off.
 */
export async function continueGeneration(template, inputs, previousContent, lang = 'es') {
  const response = await fetchWithTimeout('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template,
      inputs: { ...inputs, _previousContent: previousContent },
      lang,
    }),
  }, lang);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al continuar generación');
  }

  const data = await response.json();
  return { content: data.content, truncated: !!data.truncated };
}
