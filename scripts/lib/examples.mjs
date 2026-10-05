// Example discovery shared by `pnpm examples` and `pnpm ui:check`, so both agree on ports.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Default index port; examples get the following ports in directory order. */
export const DEFAULT_INDEX_PORT = 5100;

/**
 * Every example folder with a package.json (or only the `wanted` ones), with the HTTP and
 * HMR ports the launcher gives it when the index runs on `indexPort`.
 */
export function listExamples(wanted = [], indexPort = DEFAULT_INDEX_PORT, root = 'examples') {
  const firstPort = indexPort + 1;
  // HMR WebSockets for SSR examples, kept clear of the HTTP ports.
  const firstHmrPort = 24700 + (indexPort - DEFAULT_INDEX_PORT);
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, 'package.json')))
    .filter((e) => wanted.length === 0 || wanted.includes(e.name))
    .map((e, n) => {
      const dir = join(root, e.name);
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      return {
        name: e.name,
        dir,
        ssr: existsSync(join(dir, 'server', 'dev.ts')),
        port: firstPort + n,
        hmr: firstHmrPort + n,
        about: pkg.description ?? '',
      };
    });
}
