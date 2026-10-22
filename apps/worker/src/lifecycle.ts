import { createServer } from 'node:http';
import { once } from 'node:events';
import type { DatabaseConnection } from '@doodleforge/database';

export async function startWorkerHealth(
  connection: DatabaseConnection,
  host: string,
  port: number,
) {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    if (request.method !== 'GET' || request.url !== '/health') {
      response
        .writeHead(404)
        .end(JSON.stringify({ error: { code: 'NOT_FOUND' } }));
      return;
    }
    try {
      connection.sqlite.prepare('SELECT 1').get();
      response.end(
        JSON.stringify({
          status: 'ok',
          service: 'worker',
          generation: 'unavailable',
        }),
      );
    } catch {
      response
        .writeHead(503)
        .end(JSON.stringify({ status: 'unavailable', service: 'worker' }));
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.listen(port, host);
  await once(server, 'listening');
  let closing: Promise<void> | undefined;
  return {
    server,
    close: () =>
      (closing ??= new Promise<void>((resolve, reject) => {
        server.close((error) => {
          connection.close();
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      })),
  };
}
