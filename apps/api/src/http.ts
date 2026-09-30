import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { handle } from './api.js';
import { auth, googleEnabled } from './auth.js';
import { toNodeHandler } from 'better-auth/node';

export function createApiServer() {
  return createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url || '/', 'http://localhost');
      if (url.pathname.startsWith('/api/auth/')) {
        await toNodeHandler(auth)(incoming, outgoing);
        return;
      }
      if (url.pathname === '/api/config' && incoming.method === 'GET') {
        outgoing.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        outgoing.end(JSON.stringify({ googleEnabled }));
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        outgoing.writeHead(404);
        outgoing.end('Not found');
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      }
      const init: RequestInit & { duplex?: 'half' } = { method: incoming.method, headers };
      if (!['GET', 'HEAD'].includes(incoming.method || 'GET')) {
        init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
        init.duplex = 'half';
      }
      const response = await handle(
        new Request(url, init),
        url.pathname.slice(5).split('/').filter(Boolean),
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error);
      if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ error: 'Unable to complete the request.' }));
    }
  });
}
