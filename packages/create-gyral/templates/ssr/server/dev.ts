/// <reference types="node" />
// `npm run dev`: Vite serves the client modules; every other request is server-rendered by
// server/app.ts, re-loaded on each request so pages follow your edits.
import { gyralDevServer } from '@gyral/ssr/node';

const { url } = await gyralDevServer({
  entry: '/server/app.ts',
  app: (mod: typeof import('./app.js'), { components }) => mod.createApp({ components }),
});
console.log(`Dev server: ${url}`);
