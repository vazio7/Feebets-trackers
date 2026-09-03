// Vercel Serverless Function — roda no servidor, nunca no navegador.
// A chave da Anthropic fica em uma variável de ambiente (ANTHROPIC_API_KEY),
// configurada no painel da Vercel, e nunca é exposta ao usuário final.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' });
  }

  const { image } = req.body || {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:')) {
    return res.status(400).json({ error: 'Imagem inválida' });
  }

  const mediaType = image.split(';')[0].split(':')[1] || 'image/jpeg';
  const base64Data = image.split(',')[1];

  const prompt = `Você vai receber o print de uma promoção/missão de uma casa de apostas esportivas. Extraia os dados em JSON puro, sem markdown, sem texto fora do JSON, seguindo exatamente este formato:
{
  "casa": "nome da casa se identificável, senão vazio",
  "titulo": "resumo curto da promoção",
  "descricao": "descrição da regra completa em 1-2 frases",
  "tipoAposta": "simples" ou "multipla" ou "cria_aposta",
  "tipoRecompensa": "freebet" ou "cashback",
  "valorFreebetPorConta": número (se for freebet, senão null),
  "percentualCashback": número (se for cashback, ex: 50 para 50%, senão null),
  "tetoCashback": número (teto do cashback em R$ se houver, senão null),
  "selecoesMin": número de seleções mínimas exigidas (senão null),
  "oddMinSelecao": odd mínima por seleção (senão null),
  "oddTotalMin": odd mínima total da múltipla (senão null),
  "stakeMin": valor mínimo de stake exigido (senão null),
  "prazo": "AAAA-MM-DD" se a validade estiver visível, senão vazio
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Anthropic API: ${response.status} ${errText.slice(0, 200)}` });
    }

    const data = await response.json();
    const text = (data.content || []).map(b => b.text || '').join('\n');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Falha ao processar a imagem' });
  }
}
