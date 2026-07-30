export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, temperature, max_tokens } = req.body;

    const apiKey = process.env.api_key || process.env.API_KEY;
    const baseUrl = process.env.base_url || process.env.BASE_URL || 'https://api.siliconflow.cn/v1';
    const model = process.env.model || process.env.MODEL;

    if (!apiKey || !model) {
      return res.status(500).json({ error: '服务器配置缺失' });
    }

    const chatEndpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

    const apiRes = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 300,
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error(`[上游错误] ${apiRes.status}: ${errText}`);
      return res.status(apiRes.status).json({ error: 'AI 服务返回错误' });
    }

    const data = await apiRes.json();
    return res.status(200).json(data);
  } catch (e) {
    console.error('[代理错误]', e.message);
    return res.status(500).json({ error: '代理服务异常: ' + e.message });
  }
}
