// Prepare the exact packed artifact for the local container recipe; no publishing/deployment.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const temp = mkdtempSync(join(tmpdir(), 'gyral-mcp-pack-'));
try {
  const packed = spawnSync('pnpm', ['pack', '--pack-destination', temp], {
    cwd: join(root, 'packages/mcp'),
    stdio: 'inherit',
  });
  if (packed.status !== 0) process.exitCode = packed.status ?? 1;
  else {
    const archives = readdirSync(temp).filter((f) => f.endsWith('.tgz'));
    if (archives.length !== 1) throw new Error('Expected one packed MCP artifact');
    const file = join(temp, archives[0]);
    copyFileSync(file, join(root, 'deploy/mcp/gyral-mcp.tgz'));
    console.log(
      `MCP artifact sha256: ${createHash('sha256').update(readFileSync(file)).digest('hex')}`,
    );
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
