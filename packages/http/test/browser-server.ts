// A local HTTP endpoint and real Chromium client for native network-driver integration tests.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { chromium } from 'playwright';
import { build, type Rolldown } from 'vite';

export async function serveBrowser(
  entry: string,
  route: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const output = (await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { conditions: ['module', 'browser', 'production'] },
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: entry, preserveEntrySignatures: 'strict' },
    },
  })) as Rolldown.RolldownOutput;
  const chunks = output.output.filter((chunk) => chunk.type === 'chunk');
  if (chunks.length !== 1) throw new Error('Network fixture must build to one browser module.');
  const code = chunks[0]?.code ?? '';
  const server = createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><script type="module" src="/client.js"></script>');
    } else if (req.url === '/client.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(code);
    } else route(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No server address.');
  const base = `http://127.0.0.1:${String(address.port)}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto(base);
  return {
    server,
    base,
    browser,
    page,
    problems,
    stop: async () => {
      await browser.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        }),
      );
    },
  };
}
