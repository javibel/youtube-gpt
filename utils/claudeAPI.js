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
  return data.content;
}
