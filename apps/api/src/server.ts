import { createApiServer } from './http.js';
import { prisma } from './db.js';
const port = Number(process.env.API_PORT || 4000);
const host = process.env.API_HOST || '127.0.0.1';
const server = createApiServer();
server.listen(port, host, () => console.log(`Relay API: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () =>
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    }),
  );
