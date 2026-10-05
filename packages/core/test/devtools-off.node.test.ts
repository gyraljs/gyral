import { describe, expect, it } from 'vitest';
import * as off from '../src/devtools-off.js';

describe('production devtools module (ADR 0017)', () => {
  it('is disabled and every hook is a no-op', () => {
    const g = globalThis as Record<string, unknown>;
    const seen: unknown[] = [];
    g['__GYRAL_DEVTOOLS__'] = { emit: (e: unknown) => seen.push(e) };
    try {
      expect(off.DEVTOOLS_ENABLED).toBe(false);
      off.devStore('s', { _tag: 'X' }, 1, 2);
      off.devCommands(() => 'o')({
        phase: 'issued',
        driver: 'd',
        lane: 'l',
        policy: 'merge',
        input: 1,
      });
      expect(off.devOwner({} as Element, 'x')).toBe('');
      expect(seen).toEqual([]);
    } finally {
      delete g['__GYRAL_DEVTOOLS__'];
    }
  });
});
