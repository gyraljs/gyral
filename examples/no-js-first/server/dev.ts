/// <reference types="node" />
// Dev server: Vite serves client modules; every other request is server-rendered by
// server/app.ts, re-loaded per request so pages follow source edits. The replies live in
// `state`, created once, so they survive those reloads (gyral-abk). HMR_PORT lets several SSR
// examples run side by side (Vite's default is 24678).
import { gyralDevServer } from '@gyral/ssr/node';

const { url } = await gyralDevServer({
  entry: '/server/app.ts',
  ...(process.env['HMR_PORT'] === undefined ? {} : { hmrPort: Number(process.env['HMR_PORT']) }),
  state: (mod: typeof import('./app.js')) => mod.sampleReplies(),
  app: (mod, { components, state }) => mod.createApp({ components, replies: state }),
});
console.log(`no-js-first example: ${url}`);
