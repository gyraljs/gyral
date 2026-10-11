import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { IMAGE } from './corpus.mjs';

let user;
export function sandbox(corpus, workspace, framework) {
  if (!user) {
    const security = execFileSync('docker', ['info', '--format', '{{json .SecurityOptions}}'], {
      encoding: 'utf8',
    });
    user = security.includes('rootless') ? '0:0' : `${process.getuid()}:${process.getgid()}`;
  }
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
    user,
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,mode=1777',
    '--mount',
    `type=bind,src=${resolve(workspace)},dst=/app,readonly`,
    '--mount',
    `type=bind,src=${join(resolve(corpus), 'seeds', framework, 'node_modules')},dst=/app/node_modules,readonly`,
    '--workdir',
    '/app',
  ];
}
export { IMAGE };
