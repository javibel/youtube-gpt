import { TEMPLATES } from './prompts';

export async function callClaudeAPI(template, inputs, lang = 'es') {
  const templateData = TEMPLATES[template];
  if (!templateData) {
    throw new Error('Template no válido');
  }

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template, inputs, lang }),
  });

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
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template,
      inputs: { ...inputs, _previousContent: previousContent },
      lang,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al continuar generación');
  }

  const data = await response.json();
  return { content: data.content, truncated: !!data.truncated };
}
