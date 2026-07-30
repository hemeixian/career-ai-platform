export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const model = process.env.model || process.env.MODEL || 'unknown';
  
  return res.status(200).json({ 
    ok: true, 
    model,
    service: '职引未来 AI 代理'
  });
}
