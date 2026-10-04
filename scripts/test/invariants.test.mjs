import { describe, expect, it } from 'vitest';
import {
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
    expect(errors[0]).toContain('0002-effect-boundary.md');
  });

  it('accepts plain declarations', () => {
    expect(findEffectLeaks('index.d.ts', `export declare function f(): Promise<void>;`)).toEqual(
      [],
    );
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

  it('rejects anything that would run on GitHub-hosted runners', () => {
    expect(checkWorkflow('ci.yml', 'on:\n  push:\n')).toHaveLength(1);
    expect(checkWorkflow('ci.yml', 'on:\n  workflow_dispatch:\njobs:\n')).toEqual([]);
  });
});

describe('relativeLinks', () => {
  it('keeps relative targets only, without anchors', () => {
    expect(relativeLinks('[a](docs/x.md#y) [b](https://e.com) [c](#top)')).toEqual(['docs/x.md']);
  });
});
