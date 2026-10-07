// `pnpm mcp:refresh`: updates the committed docs snapshot (data/llms.txt, data/llms-full.txt)
// that the corpus is built from. Run it before a release, review the diff, commit.
//
//   pnpm mcp:refresh                          # from the live site (GYRAL_DOCS_ORIGIN, default https://gyral.dev)
//   pnpm mcp:refresh --from ../gyral.dev/dist # from a local gyral.dev build, before it is deployed
//
// A relative --from is resolved against the directory pnpm was started in (INIT_CWD).
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SNAPSHOT_FILES = ['llms.txt', 'llms-full.txt'];

const dataDir = join(import.meta.dirname, '..', 'data');

/** The value of `--from <dir>` or `--from=<dir>`, if given. */
export function fromArgument(argv) {
  const k = argv.findIndex((arg) => arg === '--from' || arg.startsWith('--from='));
  if (k === -1) return undefined;
  const value = argv[k].startsWith('--from=') ? argv[k].slice('--from='.length) : argv[k + 1];
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error('mcp:refresh: --from needs a directory, e.g. --from ../gyral.dev/dist');
  }
  return value;
}

/** Checks that a snapshot file looks like the site's llms output, not an error page. */
function checked(file, text, source) {
  if (!text.trimStart().startsWith('#')) {
    throw new Error(`mcp:refresh: ${source}/${file} is not an llms.txt document (no "#" title)`);
  }
  return text;
}

/** The snapshot files from a local site build (`dist/` of gyral.dev). */
export async function readLocalSnapshot(dir) {
  const files = {};
  for (const file of SNAPSHOT_FILES) {
    let text;
    try {
      text = await readFile(join(dir, file), 'utf8');
    } catch {
      throw new Error(
        `mcp:refresh: ${join(dir, file)} not found. Build gyral.dev first (its build writes llms.txt and llms-full.txt to dist/).`,
      );
    }
    files[file] = checked(file, text, dir);
  }
  return files;
}

/** The snapshot files from a deployed site. */
export async function fetchSnapshot(origin) {
  const files = {};
  for (const file of SNAPSHOT_FILES) {
    const response = await fetch(`${origin}/${file}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`${origin}/${file} answered ${String(response.status)}`);
    files[file] = checked(file, await response.text(), origin);
  }
  return files;
}

async function main() {
  const from = fromArgument(process.argv.slice(2));
  const source =
    from === undefined
      ? (process.env.GYRAL_DOCS_ORIGIN ?? 'https://gyral.dev')
      : isAbsolute(from)
        ? from
        : resolve(process.env.INIT_CWD ?? process.cwd(), from);
  const files = from === undefined ? await fetchSnapshot(source) : await readLocalSnapshot(source);
  for (const [file, text] of Object.entries(files)) {
    await writeFile(join(dataDir, file), text);
    console.log(`data/${file}: ${(Buffer.byteLength(text) / 1024).toFixed(0)} KiB from ${source}`);
  }
  console.log('Review the diff, then `pnpm --filter @gyral/mcp build` rebuilds the corpus.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
