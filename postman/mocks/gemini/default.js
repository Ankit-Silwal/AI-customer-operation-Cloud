const http = require('http');

http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(501); res.end(JSON.stringify({ error: { message: 'Endpoint not modeled' } })); return;
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const input = req.body || JSON.parse(body);
      if (input.model !== 'gemini-3.1-flash-lite' || input.messages?.[0]?.role !== 'system' ||
          input.messages?.[1]?.role !== 'user' || !input.messages[1].content.includes('Source excerpts:')) {
        res.writeHead(400); res.end(JSON.stringify({ error: { message: 'Invalid completion request' } })); return;
      }
      res.end(JSON.stringify({
        id: 'chatcmpl-local-contract', object: 'chat.completion', created: 1,
        model: input.model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Refunds are available within 30 days. [1]' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
      }));
    } catch {
      res.writeHead(400); res.end(JSON.stringify({ error: { message: 'Invalid JSON' } }));
    }
  });
}).listen(process.env.PORT);
