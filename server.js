/**
 * 轻量 AI 代理服务器
 * 保护 API Key 不暴露在前端
 * 用法：node server.js（配置好 backend/.env 或环境变量）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 尝试读取 backend/.env（本地开发用，部署到 Render 时使用环境变量）
function loadLocalEnv() {
  const envPath = path.join(__dirname, 'backend', '.env');
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n');
  const env = {};
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx === -1 || line.trim().startsWith('#')) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    if (key) env[key] = val;
  }
  return env;
}

const localEnv = loadLocalEnv();
const PORT = process.env.PORT || 3456;

// 优先使用系统环境变量（Render 部署时），回退到 .env 文件（本地开发时）
const API_KEY = process.env.api_key || process.env.API_KEY || localEnv.api_key || localEnv.API_KEY;
const BASE_URL = process.env.base_url || process.env.BASE_URL || localEnv.base_url || localEnv.BASE_URL;
const MODEL = process.env.model || process.env.MODEL || localEnv.model || localEnv.MODEL;

if (!API_KEY || !BASE_URL || !MODEL) {
  console.error('[错误] 缺少必要配置！需要：api_key, base_url, model');
  console.error('  本地开发：创建 backend/.env 文件');
  console.error('  Render 部署：在 Dashboard → Environment 中设置环境变量');
  process.exit(1);
}

// 拼接 chat completions 端点
const CHAT_ENDPOINT = BASE_URL.replace(/\/+$/, '') + '/chat/completions';

console.log(`[AI 代理] 模型: ${MODEL} | 端口: ${PORT}`);

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 健康检查
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: MODEL }));
    return;
  }

  // AI 代理接口
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { messages, temperature, max_tokens } = JSON.parse(body);

        const apiRes = await fetch(CHAT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages,
            temperature: temperature ?? 0.7,
            max_tokens: max_tokens ?? 300,
          }),
        });

        if (!apiRes.ok) {
          const errText = await apiRes.text();
          console.error(`[上游错误] ${apiRes.status}: ${errText}`);
          res.writeHead(apiRes.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'AI 服务返回错误', status: apiRes.status }));
          return;
        }

        const data = await apiRes.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        console.error('[代理错误]', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '代理服务异常: ' + e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`\n  ┌──────────────────────────────────────┐`);
  console.log(`  │  AI 代理服务器已启动                  │`);
  console.log(`  │  地址: http://localhost:${PORT}        │`);
  console.log(`  │  模型: ${MODEL.slice(0, 28).padEnd(28)}    │`);
  console.log(`  └──────────────────────────────────────┘\n`);
  console.log(`  前端调用地址: http://localhost:${PORT}/api/chat`);
  console.log(`  健康检查:     http://localhost:${PORT}/api/health\n`);
});
