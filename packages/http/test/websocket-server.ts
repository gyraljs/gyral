import { resolve } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket as ServerSocket, type RawData } from 'ws';
import { serveBrowser } from './browser-server.js';

export const socketText = (data: RawData): string =>
  Buffer.isBuffer(data)
    ? data.toString('utf8')
    : data instanceof ArrayBuffer
      ? Buffer.from(data).toString('utf8')
      : Buffer.concat(data).toString('utf8');

export async function socketBrowser(
  handler: (socket: ServerSocket, request: IncomingMessage) => void,
) {
  const host = await serveBrowser(
    resolve(import.meta.dirname, './fixtures/websocket-browser.ts'),
    (_req, res) => {
      res.writeHead(404).end();
    },
  );
  const sockets = new WebSocketServer({ server: host.server, path: '/socket' });
  sockets.on('connection', handler);
  return {
    ...host,
    sockets,
    url: host.base.replace('http:', 'ws:') + '/socket',
    stop: async () => {
      await host.page.close();
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((resolve, reject) => {
        sockets.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
      await host.stop();
    },
  };
}
