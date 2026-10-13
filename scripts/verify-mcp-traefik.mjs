// Local Compose/Traefik acceptance only. No public DNS, ACME or server access.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { request } from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const docker = async (...args) =>
  (await execute('docker', args, { timeout: 120_000 })).stdout.trim();
const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'packages/mcp/package.json'));
const { Client } = await import(require.resolve('@modelcontextprotocol/sdk/client/index.js'));
const { StreamableHTTPClientTransport } = await import(
  require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')
);
const temp = await mkdtemp(join(tmpdir(), 'gyral-traefik-'));
const suffix = randomUUID().slice(0, 8);
const project = `gyral-mcp-review-${suffix}`;
const network = `${project}-proxy`;
const proxy = `${project}-traefik`;
const composeArgs = [
  'compose',
  '--project-name',
  project,
  '--env-file',
  join(temp, '.env'),
  '-f',
  join(root, 'deploy/mcp/compose.yaml'),
  '-f',
  join(temp, 'review.yaml'),
];
const compose = (...args) => docker(...composeArgs, ...args);
try {
  const socketUrl = await docker('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}');
  if (!socketUrl.startsWith('unix://'))
    throw new Error('Local Unix-socket Docker context required');
  const identity = JSON.parse(await readFile(join(root, 'deploy/mcp/artifact.json'), 'utf8'));
  const image = process.env['GYRAL_MCP_IMAGE'] ?? 'gyral-mcp:review';
  const platform = process.env['GYRAL_MCP_REVIEW_PLATFORM'];
  const subnet = process.env['GYRAL_MCP_REVIEW_SUBNET'];
  await docker('network', 'create', ...(subnet === undefined ? [] : ['--subnet', subnet]), network);
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
  await writeFile(
    join(temp, 'dynamic.yaml'),
    'tls:\n  certificates:\n    - certFile: /tls/fullchain.pem\n      keyFile: /tls/privkey.pem\n',
  );
  await writeFile(
    join(temp, '.env'),
    [
      `GYRAL_MCP_IMAGE=${image}`,
      `GYRAL_MCP_EXPECTED_CORPUS_SHA256=${identity.corpusSha256}`,
      'GYRAL_MCP_PUBLIC_ORIGIN=https://mcp.gyral.dev',
      `TRAEFIK_NETWORK=${network}`,
      'TRAEFIK_ENTRYPOINT=websecure',
      'TRAEFIK_CERT_RESOLVER=local-review',
      '',
    ].join('\n'),
  );
  // Supply a local certificate instead of contacting a real ACME resolver.
  await writeFile(
    join(temp, 'review.yaml'),
    `services:\n  gyral-mcp:\n${platform === undefined ? '' : `    platform: ${platform}\n`}` +
      `    labels:\n      dev.gyral.mcp.review: ${suffix}\n` +
      '      traefik.http.routers.gyral-mcp.tls.certresolver: ""\n',
  );
  await compose('config', '--quiet');
  await compose('up', '-d', '--wait', '--wait-timeout', '60');
  const backend = await compose('ps', '-q', 'gyral-mcp');
  const [info] = JSON.parse(await docker('inspect', backend));
  assert.equal(info.State.Health.Status, 'healthy');
  assert.equal(info.Config.User, 'node');
  assert.deepEqual(info.Config.Cmd, ['gyral-mcp', 'http']);
  assert.equal(info.HostConfig.ReadonlyRootfs, true);
  assert.equal(info.HostConfig.Memory, 268_435_456);
  assert.deepEqual(info.HostConfig.PortBindings ?? {}, {});
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
    `${socketUrl.slice(7)}:/var/run/docker.sock:ro`,
    '-v',
    `${temp}/tls:/tls:ro`,
    '-v',
    `${temp}/dynamic.yaml:/dynamic.yaml:ro`,
    'traefik:v3.6@sha256:31267173a15b4944e797a76ffd9c419707c8d8b32fe5b610f80cd0cfa05f372d',
    '--entrypoints.websecure.address=:443',
    '--entrypoints.websecure.transport.respondingtimeouts.readtimeout=10s',
    '--entrypoints.websecure.transport.respondingtimeouts.writetimeout=15s',
    '--providers.docker=true',
    '--providers.docker.exposedbydefault=false',
    `--providers.docker.constraints=Label(\`dev.gyral.mcp.review\`,\`${suffix}\`)`,
    '--providers.file.filename=/dynamic.yaml',
  );
  const port = Number((await docker('port', proxy, '443/tcp')).split(':').at(-1));
  const ca = await readFile(join(temp, 'tls/fullchain.pem'));
  // Node fetch versions can ignore a custom Host; use HTTPS's actual header API.
  const localFetch = (input, init = {}) =>
    new Promise((ok, fail) => {
      const url = new URL(String(input));
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      if (init.body !== undefined && typeof init.body !== 'string') {
        fail(new Error('Review expects SDK JSON request bodies'));
        return;
      }
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          servername: 'mcp.gyral.dev',
          ca,
          path: url.pathname + url.search,
          method: init.method ?? 'GET',
          headers: { Host: 'mcp.gyral.dev', ...headers },
        },
        (res) => {
          const parts = [];
          res.on('data', (part) => parts.push(part));
          res.on('error', fail);
          res.on('end', () => {
            const bytes = Buffer.concat(parts);
            const responseHeaders = new Headers();
            for (const [key, value] of Object.entries(res.headers))
              if (value !== undefined)
                responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
            ok(
              new Response(bytes.length === 0 ? null : bytes, {
                status: res.statusCode,
                headers: responseHeaders,
              }),
            );
          });
        },
      );
      req.setTimeout(10_000, () => req.destroy(new Error('Traefik review timeout')));
      req.on('error', fail);
      req.end(init.body);
    });
  let health;
  for (let n = 0; n < 100; n++) {
    try {
      const res = await localFetch('https://mcp.gyral.dev/healthz');
      if (res.status === 200) {
        health = await res.json();
        break;
      }
    } catch {
      /* proxy warming */
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.equal(health?.version, identity.corpusVersion);
  assert.equal(health.corpusSha256, identity.corpusSha256);
  const client = new Client({ name: 'gyral-traefik-review', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('https://mcp.gyral.dev/mcp'), {
        fetch: localFetch,
      }),
    );
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 7);
    assert(!tools.tools.some((tool) => tool.name === 'check_snippet'));
    assert((await client.readResource({ uri: 'gyral://skill' })).contents.length > 0);
    // A tool error also has content, so check the error flag and the answer itself.
    const define = await client.callTool({ name: 'get_api', arguments: { symbol: 'define' } });
    assert(!define.isError, 'get_api define returned a tool error');
    assert(
      define.content.some((part) => part.type === 'text' && part.text.includes('@gyral/core')),
    );
    assert((await client.listPrompts()).prompts.length > 0);
  } finally {
    await client.close();
  }
  assert.equal(
    (await localFetch('https://mcp.gyral.dev/healthz', { headers: { Host: 'evil.example' } }))
      .status,
    404,
  );
  assert.equal(
    (
      await localFetch('https://mcp.gyral.dev/healthz', {
        headers: { Origin: 'https://evil.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await localFetch('https://mcp.gyral.dev/mcp', { method: 'POST', body: 'x'.repeat(17_000) }))
      .status,
    413,
  );
  await new Promise((ok) => setTimeout(ok, 1000));
  const burst = await Promise.all(
    Array.from({ length: 30 }, (_, id) =>
      localFetch('https://mcp.gyral.dev/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/list' }),
      }),
    ),
  );
  assert(burst.some((res) => res.status === 429));
  await compose('stop', 'gyral-mcp');
  const stopped = JSON.parse(await docker('inspect', '--format', '{{json .State}}', backend));
  assert.equal(stopped.ExitCode, 0);
  assert.equal(stopped.OOMKilled, false);
  console.log(
    `Compose/Traefik passed: healthy corpus ${health.version}/${health.corpusSha256}, no host port, label-discovered TLS, official SDK tools/resources/prompts, Host/Origin rejection, body 413, rate 429 and graceful stop; ${image}${platform === undefined ? '' : ` (${platform})`}. Local certificate only; no ACME/DNS changes.`,
  );
} finally {
  await docker('rm', '-f', proxy).catch(() => undefined);
  await compose('down', '--remove-orphans').catch(() => undefined);
  await docker('network', 'rm', network).catch(() => undefined);
  await rm(temp, { recursive: true, force: true });
}
