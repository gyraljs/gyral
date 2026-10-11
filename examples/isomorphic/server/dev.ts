/// <reference types="node" />
// Dev server: Vite serves client modules; every other request is server-rendered by
// server/app.ts, re-loaded per request so pages follow source edits. HMR_PORT lets several
// SSR examples run side by side (Vite's default is 24678).
import { gyralDevServer } from '@gyral/ssr/node';

const { url } = await gyralDevServer({
  entry: '/server/app.ts',
  ...(process.env['HMR_PORT'] === undefined ? {} : { hmrPort: Number(process.env['HMR_PORT']) }),
  app: (mod: typeof import('./app.js')) => mod.createApp({ clientEntry: '/src/entry-client.ts' }),
});
console.log(`isomorphic example: ${url}`);
