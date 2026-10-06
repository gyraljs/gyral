// `pnpm mcp:refresh --from <dir>`: the docs snapshot from a local gyral.dev build, so the corpus
// can follow docs that aren't deployed yet.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fromArgument, readLocalSnapshot } from '../scripts/refresh-snapshot.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const site = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-site-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};

describe('mcp:refresh --from', () => {
  it('reads --from in both spellings and leaves the live site as the default', () => {
    expect(fromArgument(['--from', '../gyral.dev/dist'])).toBe('../gyral.dev/dist');
    expect(fromArgument(['--from=/abs/dist'])).toBe('/abs/dist');
    expect(fromArgument([])).toBeUndefined();
    expect(() => fromArgument(['--from'])).toThrow(/needs a directory/);
  });

  it('reads llms.txt and llms-full.txt from a site build', async () => {
    const dir = site({ 'llms.txt': '# Gyral\n', 'llms-full.txt': '# Gyral docs\n\nBody\n' });
    await expect(readLocalSnapshot(dir)).resolves.toEqual({
      'llms.txt': '# Gyral\n',
      'llms-full.txt': '# Gyral docs\n\nBody\n',
    });
  });

  it('says what to do when the build is missing or not an llms document', async () => {
    await expect(readLocalSnapshot(site({ 'llms.txt': '# Gyral\n' }))).rejects.toThrow(
      /llms-full\.txt not found\. Build gyral\.dev first/,
    );
    const html = site({ 'llms.txt': '<!doctype html>', 'llms-full.txt': '# ok' });
    await expect(readLocalSnapshot(html)).rejects.toThrow(/not an llms\.txt document/);
  });
});
