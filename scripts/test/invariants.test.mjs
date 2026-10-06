import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkDependencies,
  checkWorkflow,
  findEffectLeaks,
  relativeLinks,
  workflowTriggers,
} from '../lib/invariants.mjs';

describe('findEffectLeaks', () => {
  it('flags static and dynamic Effect imports in declarations', () => {
    const dts = `import type { Effect } from 'effect';\nexport declare const x: import("@effect/platform").HttpClient;`;
    const errors = findEffectLeaks('index.d.ts', dts);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('0015-runtime-size-spike.md');
  });

  it('accepts plain declarations', () => {
    expect(findEffectLeaks('index.d.ts', `export declare function f(): Promise<void>;`)).toEqual(
      [],
    );
  });
});

describe('checkDependencies', () => {
  it('rejects effect in any package', () => {
    const errors = checkDependencies('packages/http/package.json', {
      name: '@gyral/http',
      dependencies: { effect: '^4.0.0' },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('ADR 0015');
  });

  it('keeps @gyral/core free of runtime dependencies besides the allowlist', () => {
    const manifest = {
      name: '@gyral/core',
      dependencies: { '@standard-schema/spec': '1.1.0', 'left-pad': '1.0.0' },
    };
    const errors = checkDependencies('packages/core/package.json', manifest);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('left-pad');
  });

  it('accepts the real core manifest shape', () => {
    const manifest = JSON.parse(readFileSync('packages/core/package.json', 'utf8'));
    expect(checkDependencies('packages/core/package.json', manifest)).toEqual([]);
  });

  it('allows only optional build-time peers in @gyral/core (vite, parse5, eslint)', () => {
    const errors = checkDependencies('packages/core/package.json', {
      name: '@gyral/core',
      peerDependencies: {
        react: '^19.0.0',
        parse5: '^8.0.0',
        vite: '^8.0.0',
        eslint: '^10.0.0',
        jsdom: '^26.0.0',
      },
      peerDependenciesMeta: { parse5: { optional: true } },
    });
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain('Remove the "react" peer');
    expect(errors[1]).toContain('"vite" must be optional');
    expect(errors[2]).toContain('"eslint" must be optional');
    expect(errors[3]).toContain('Remove the "jsdom" peer');
  });
});

describe('workflow triggers', () => {
  it('reads block, inline and list forms', () => {
    expect(
      workflowTriggers('on:\n  workflow_dispatch:\n  push:\n    branches: [main]\njobs:\n'),
    ).toEqual(['workflow_dispatch', 'push']);
    expect(workflowTriggers('on: push\n')).toEqual(['push']);
    expect(workflowTriggers('on: [push, pull_request]\n')).toEqual(['push', 'pull_request']);
  });

  const ci =
    'on:\n  push:\n  pull_request:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n';

  it('lets only ci.yml run on push and pull_request', () => {
    expect(checkWorkflow('.github/workflows/ci.yml', ci)).toEqual([]);
    expect(checkWorkflow('.github/workflows/other.yml', 'on:\n  push:\n')).toHaveLength(1);
    expect(checkWorkflow('other.yml', 'on:\n  workflow_dispatch:\njobs:\n')).toEqual([]);
    expect(checkWorkflow('ci.yml', ci.replace('  push:\n', '  schedule:\n'))).toHaveLength(1);
  });

  it('never allows pull_request_target', () => {
    const errors = checkWorkflow('ci.yml', ci.replace('pull_request:', 'pull_request_target:'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('untrusted');
  });

  it('requires a read-only token in ci.yml', () => {
    expect(
      checkWorkflow('ci.yml', ci.replace('  contents: read\n', '  contents: write\n')),
    ).toHaveLength(1);
  });

  it('keeps release.yml manual and behind the npm environment', () => {
    const release = 'on:\n  workflow_dispatch:\njobs:\n  publish:\n    environment: npm\n';
    expect(checkWorkflow('release.yml', release)).toEqual([]);
    expect(checkWorkflow('release.yml', release.replace('workflow_dispatch', 'push'))).toHaveLength(
      1,
    );
    expect(
      checkWorkflow('release.yml', release.replace('    environment: npm\n', '')),
    ).toHaveLength(1);
  });
});

describe('relativeLinks', () => {
  it('keeps relative targets only, without anchors', () => {
    expect(relativeLinks('[a](docs/x.md#y) [b](https://e.com) [c](#top)')).toEqual(['docs/x.md']);
  });
});
