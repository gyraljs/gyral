import { describe, expect, it } from 'vitest';
import { tsBlocks } from '../check-skill.mjs';

describe('check-skill tsBlocks', () => {
  it('extracts ts and typescript blocks with their first code line', () => {
    const md = [
      '# Title',
      '```ts',
      "import { define } from '@gyral/core';",
      '```',
      'text',
      '```typescript',
      'const x = 1;',
      'void x;',
      '```',
    ].join('\n');
    expect(tsBlocks(md)).toEqual([
      { line: 3, code: "import { define } from '@gyral/core';" },
      { line: 7, code: 'const x = 1;\nvoid x;' },
    ]);
  });

  it('skips text and other fences, so fragments can opt out', () => {
    const md = ['```text', 'npm create gyral@latest', '```', '```json', '{}', '```'].join('\n');
    expect(tsBlocks(md)).toEqual([]);
  });
});
