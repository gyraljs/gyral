import { describe, expect, it } from 'vitest';
import { parseArgs, sceneStem, trimArgs, trimSeconds, validateDemo } from '../lib/demos.mjs';

describe('demos:record arguments', () => {
  it('defaults to every demo, port 5600, light', () => {
    expect(parseArgs([]).options).toEqual({ examples: [], port: 5600, scheme: 'light' });
  });

  it('takes example names, a port and a scheme', () => {
    const { options, errors } = parseArgs(['themes', '--port=5800', '--scheme=dark']);
    expect(errors).toEqual([]);
    expect(options).toEqual({ examples: ['themes'], port: 5800, scheme: 'dark' });
  });

  it('rejects bad values and unknown flags', () => {
    expect(parseArgs(['--port=x', '--scheme=blue', '--fast']).errors).toHaveLength(3);
    expect(parseArgs([], { EXAMPLES_PORT: '6000' }).options.port).toBe(6000);
  });
});

describe('demo modules', () => {
  const run = async () => undefined;
  const valid = { pitch: 'p', usual: 'u', scenes: [{ id: 'main', run }] };

  it('accepts a minimal demo', () => {
    expect(validateDemo('x', valid)).toEqual([]);
  });

  it('reports missing text, bad scenes and duplicate ids', () => {
    expect(validateDemo('x', null)).toHaveLength(1);
    expect(validateDemo('x', { scenes: [] })).toHaveLength(3);
    const problems = validateDemo('x', {
      pitch: 'p',
      usual: 'u',
      scenes: [
        { id: 'a', run },
        { id: 'a', run },
        { id: 'Bad Id', path: 'nope', javaScript: 'no' },
      ],
    });
    expect(problems.join('\n')).toMatch(/duplicate id 'a'/);
    expect(problems.join('\n')).toMatch(/'run' must be a function/);
    expect(problems.join('\n')).toMatch(/'path' must start with \//);
    expect(problems.join('\n')).toMatch(/'javaScript' must be a boolean/);
  });

  it('names one-scene demos after the example', () => {
    expect(sceneStem('themes', 'main', 1)).toBe('themes');
    expect(sceneStem('no-js-first', 'js-off', 2)).toBe('no-js-first-js-off');
  });
});

describe('trimming the unready start (gyral-xpd)', () => {
  it('cuts from the page opening to when it was ready, never negative', () => {
    expect(trimSeconds(1000, 1650.4)).toBe(0.65);
    expect(trimSeconds(1000, 900)).toBe(0);
  });

  it('builds a frame-accurate ffmpeg cut without audio', () => {
    const args = trimArgs('raw.webm', 'out.webm', 0.65);
    expect(args.indexOf('-ss')).toBeGreaterThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('0.650');
    expect(args).toContain('-an');
    expect(args.at(-1)).toBe('out.webm');
  });
});
