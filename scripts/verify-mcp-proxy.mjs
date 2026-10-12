// Local TLS/container review only. No DNS, account, remote deployment or publication writes.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const temp = await mkdtemp(join(tmpdir(), 'gyral-mcp-tls-'));
const suffix = randomUUID().slice(0, 8);
const network = `gyral-mcp-review-${suffix}`;
const backend = `gyral-mcp-backend-${suffix}`;
const proxy = `gyral-mcp-proxy-${suffix}`;
const docker = async (...args) =>
  (await execute('docker', args, { timeout: 120_000 })).stdout.trim();
try {
  await mkdir(join(temp, 'tls'));
  await execute('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=mcp.gyral.dev',
    '-addext',
    'subjectAltName=DNS:mcp.gyral.dev',
    '-keyout',
    join(temp, 'tls/privkey.pem'),
    '-out',
    join(temp, 'tls/fullchain.pem'),
  ]);
  await copyFile(resolve('deploy/mcp/nginx.conf'), join(temp, 'mcp.conf'));
  await writeFile(
    join(temp, 'nginx.conf'),
    'events {}\nhttp { include /etc/nginx/mime.types; include /etc/nginx/mcp.conf; }\n',
  );
  const subnet = process.env['GYRAL_MCP_REVIEW_SUBNET'];
  await docker('network', 'create', ...(subnet === undefined ? [] : ['--subnet', subnet]), network);
  await docker(
    'run',
    '-d',
    '--name',
    backend,
    '--network',
    network,
    '--network-alias',
    'gyral-mcp',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--memory',
    '256m',
    '--pids-limit',
    '64',
    '-e',
    'GYRAL_MCP_PUBLIC_ORIGIN=https://mcp.gyral.dev',
    process.env['GYRAL_MCP_IMAGE'] ?? 'gyral-mcp:review',
  );
  await docker(
    'run',
    '-d',
    '--name',
    proxy,
    '--network',
    network,
    '-p',
    '127.0.0.1::443',
    '-v',
    `${temp}/tls:/etc/nginx/tls:ro`,
    '-v',
    `${temp}/mcp.conf:/etc/nginx/mcp.conf:ro`,
    '-v',
    `${temp}/nginx.conf:/etc/nginx/nginx.conf:ro`,
    'nginx:stable-alpine',
  );
  await docker('exec', proxy, 'nginx', '-t');
  const port = Number((await docker('port', proxy, '443/tcp')).split(':').at(-1));
  const ca = await readFile(join(temp, 'tls/fullchain.pem'));
  const call = (path, message, headers = {}) =>
    new Promise((ok, fail) => {
      const bytes = message === undefined ? undefined : Buffer.from(JSON.stringify(message));
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          servername: 'mcp.gyral.dev',
          ca,
          path,
          method: bytes === undefined ? 'GET' : 'POST',
          headers: {
            Host: 'mcp.gyral.dev',
            Accept: 'application/json, text/event-stream',
            ...(bytes === undefined
              ? {}
              : { 'Content-Type': 'application/json', 'Content-Length': bytes.length }),
            ...headers,
          },
        },
        (res) => {
          const parts = [];
          res.on('data', (part) => parts.push(part));
          res.on('end', () =>
            ok({ status: res.statusCode, text: Buffer.concat(parts).toString('utf8') }),
          );
        },
      );
      req.setTimeout(10_000, () => req.destroy(new Error('TLS review timeout')));
      req.on('error', fail);
      req.end(bytes);
    });
  let health;
  for (let n = 0; n < 100; n++) {
    try {
      health = await call('/healthz');
      if (health.status === 200) break;
    } catch {
      /* listener warming */
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.equal(health?.status, 200);
  const identity = JSON.parse(health.text);
  assert.match(identity.corpusSha256, /^[a-f0-9]{64}$/);
  const init = await call('/mcp', {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'gyral-tls-review', version: '1' },
    },
  });
  assert.equal(init.status, 200);
  assert.equal(JSON.parse(init.text).result.protocolVersion, '2025-11-25');
  const listed = await call('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const tools = JSON.parse(listed.text).result.tools;
  assert.equal(tools.length, 7);
  assert(!tools.some((tool) => tool.name === 'check_snippet'));
  assert.equal(
    (
      await call(
        '/mcp',
        { jsonrpc: '2.0', id: 3, method: 'tools/list' },
        { Origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  assert.equal((await call('/healthz', undefined, { Host: 'evil.example' })).status, 403);
  const burst = await Promise.all(
    Array.from({ length: 30 }, (_, id) =>
      call('/mcp', { jsonrpc: '2.0', id, method: 'tools/list' }),
    ),
  );
  assert(burst.some((result) => result.status === 429));
  await docker('stop', '--time', '10', backend);
  const stopped = JSON.parse(await docker('inspect', '--format', '{{json .State}}', backend));
  assert.equal(stopped.ExitCode, 0);
  assert.equal(stopped.OOMKilled, false);
  console.log(
    `Local TLS proxy: seven public tools, Host/Origin rejection, edge 429 and graceful stop passed; version ${identity.version}, corpus ${identity.corpusSha256}.`,
  );
} finally {
  await docker('rm', '-f', proxy, backend).catch(() => undefined);
  await docker('network', 'rm', network).catch(() => undefined);
  await rm(temp, { recursive: true, force: true });
}
