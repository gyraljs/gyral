import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { GENERATED_DIR, IMAGE } from './corpus.mjs';

// Generated build output (Gyral's element typings, `.gyral/elements.d.ts`) goes to its own
// writable mount over this precreated, empty mountpoint. The source tree, dependencies and
// oracle stay read-only (protocol v3, H6 / gyral-7se.14). Every framework gets the same mount.
export { GENERATED_DIR };

let user;
export function sandbox(corpus, workspace, framework, generated) {
  if (!generated) throw new Error('A fresh writable directory for generated output is required');
  if (!user) {
    const security = execFileSync('docker', ['info', '--format', '{{json .SecurityOptions}}'], {
      encoding: 'utf8',
    });
    user = security.includes('rootless') ? '0:0' : `${process.getuid()}:${process.getgid()}`;
  }
  return sandboxArgs(corpus, workspace, framework, generated, user);
}

export function sandboxArgs(corpus, workspace, framework, generated, owner) {
  return [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '128',
    '--memory',
    '1g',
    '--cpus',
    '2',
    '--user',
    owner,
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,mode=1777',
    '--mount',
    `type=bind,src=${resolve(workspace)},dst=/app,readonly`,
    '--mount',
    `type=bind,src=${join(resolve(corpus), 'seeds', framework, 'node_modules')},dst=/app/node_modules,readonly`,
    '--mount',
    `type=bind,src=${resolve(generated)},dst=/app/${GENERATED_DIR}`,
    '--workdir',
    '/app',
  ];
}

/** Build/type failures caused by the sandbox's filesystem rules, not by the agent's code. */
export const SANDBOX_FAILURE =
  /\b(EACCES|EROFS|EPERM)\b|read-only file system|permission denied|operation not permitted/i;
export { IMAGE };
