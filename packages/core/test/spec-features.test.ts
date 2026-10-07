// `#spec-features` (view/05-element.md "Features register themselves", gyral-c5d.12): the
// runtime path carries view transitions, the frame lane and custom states; compiled builds
// fill slots for the fields their modules name, and development builds warn about a field
// whose slot stayed empty (its name built at run time).
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as full from '../src/spec-features.js';
import * as used from '../src/spec-features-used.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#spec-features', () => {
  it('has everything on the runtime path', () => {
    expect(full.viewTransitions).toBeTypeOf('function');
    expect(full.frameLane).toBeTypeOf('object');
    expect(full.customStates).toBeTypeOf('function');
  });

  it('starts empty in compiled builds and warns in development about unfilled fields', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(used.customStates).toBeUndefined();
    used.checkSpecFeatures('x-lamp', { states: () => ({}) });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/<x-lamp> declares states/);
    used.useCustomStates(full.customStates ?? (() => undefined));
    expect(used.customStates).toBe(full.customStates);
    used.checkSpecFeatures('x-lamp', { states: () => ({}) });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
