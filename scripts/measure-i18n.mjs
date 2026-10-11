// ADR 0027 wiring measurement; catalogs, caching, loading and polyfills remain app costs.
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const result = await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    minify: true,
    lib: { entry: 'scripts/spikes/intl.mjs', formats: ['es'] },
  },
});
const outputs = Array.isArray(result) ? result.flatMap((r) => r.output) : result.output;
const chunk = outputs.find((o) => o.type === 'chunk');
if (chunk === undefined) throw new Error('i18n spike: no bundle');
console.log(
  JSON.stringify({
    minifiedBytes: Buffer.byteLength(chunk.code),
    gzipBytes: gzipSync(chunk.code, { level: 9 }).byteLength,
  }),
);
