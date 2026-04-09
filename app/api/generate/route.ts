import { TEMPLATES } from '@/utils/prompts';

export async function POST(request: Request) {
  try {
    const { apiKey, template, inputs } = await request.json();

    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return Response.json(
        { error: 'API key inválida' },
        { status: 400 }
      );
    }

    const templateData = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!templateData) {
      return Response.json(
        { error: 'Template no válido' },
        { status: 400 }
      );
    }

    const prompt = templateData.prompt(inputs);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
      body: JSON.stringify({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return Response.json(
        { error: error.error?.message || 'Error desconocido' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json({ content: data.content[0].text });
  } catch (error) {
    console.error('API Error:', error);
    return Response.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}