import { TEMPLATES } from './prompts';

export async function callClaudeAPI(apiKey, template, inputs) {
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    throw new Error('API key inválida');
  }

  const templateData = TEMPLATES[template];
  if (!templateData) {
    throw new Error('Template no válido');
  }

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey,
        template,
        inputs,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al generar contenido');
    }

    const data = await response.json();
    return data.content;
  } catch (error) {
    throw error;
  }
}