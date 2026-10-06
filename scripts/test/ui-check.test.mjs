import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listExamples } from '../lib/examples.mjs';
import {
  axeSummary,
  overflowFinding,
  parseArgs,
  renderReport,
  shotFailures,
  significantConsole,
  validateScenario,
} from '../lib/ui-check.mjs';

describe('parseArgs', () => {
  it('reads examples, modes and numeric options', () => {
    const { options, errors } = parseArgs(
      ['counter', 'bmi', '--compare', '--max-diff=0.01', '--port=5800'],
      {},
    );
    expect(errors).toEqual([]);
    expect(options).toMatchObject({
      examples: ['counter', 'bmi'],
      compare: true,
      maxDiff: 0.01,
      port: 5800,
    });
  });

  it('takes the base port from EXAMPLES_PORT and rejects bad input', () => {
    expect(parseArgs([], { EXAMPLES_PORT: '5900' }).options.port).toBe(5900);
    expect(parseArgs(['--threshold=2']).errors).toContain('--threshold must be between 0 and 1');
    expect(parseArgs(['--baseline', '--compare']).errors).toHaveLength(1);
    expect(parseArgs(['--nope']).errors).toEqual(['unknown option --nope']);
    expect(parseArgs(['--port=abc']).errors[0]).toContain('expects a number');
  });
});

describe('validateScenario', () => {
  it('accepts the step vocabulary', () => {
    const scenario = {
      once: true,
      allowConsole: [/x/],
      steps: [
        { goto: '/about' },
        { click: { role: 'button', name: 'Go' } },
        { fill: { label: 'Name' }, value: 'Ada' },
        { check: { css: '#t' } },
        { press: 'ArrowDown' },
        { waitFor: { text: 'Done' } },
        { wait: 100 },
      ],
    };
    expect(validateScenario('x', scenario)).toEqual([]);
  });

  it('explains what is wrong, with the file and step', () => {
    const errors = validateScenario('x', {
      steps: [
        { goto: 'about' },
        { fill: { label: 'Name' } },
        { click: { role: 'a', text: 'b' } },
        { wait: 1e6 },
        {},
      ],
    });
    expect(errors).toHaveLength(5);
    expect(errors[0]).toMatch(/^examples\/x\/ui-scenario\.mjs step 1: goto/);
    expect(validateScenario('x', { steps: 'no' })[0]).toContain('"steps" must be an array');
  });

  // Imports ~20 scenario modules; under a loaded machine plus the parallel browser projects
  // that takes longer than the 5 s default.
  it('every example ships a valid scenario', { timeout: 30_000 }, async () => {
    for (const ex of listExamples([], 5100, resolve('examples'))) {
      const scenario = (await import(pathToFileURL(resolve(ex.dir, 'ui-scenario.mjs')).href))
        .default;
      expect(validateScenario(ex.name, scenario), ex.name).toEqual([]);
    }
  });
});

describe('listExamples', () => {
  it('assigns ports in directory order after the index port', () => {
    const all = listExamples([], 5400, resolve('examples'));
    const dirs = readdirSync('examples').filter((d) => all.some((e) => e.name === d));
    expect(all.map((e) => e.name)).toEqual(dirs);
    expect(all[0]?.port).toBe(5401);
    expect(all[0]?.hmr).toBe(25000);
    const two = listExamples(['counter', 'register'], 5400, resolve('examples'));
    expect(two.map((e) => e.port)).toEqual([5401, 5402]);
    expect(two.find((e) => e.name === 'register')?.ssr).toBe(true);
  });
});

describe('console, overflow and axe', () => {
  it('fails on errors and warnings except the expected dev messages and allowed patterns', () => {
    const entries = [
      { type: 'debug', text: '[vite] connected.' },
      { type: 'log', text: 'hello' },
      { type: 'error', text: 'Failed to load resource: 404' },
      { type: 'pageerror', text: 'TypeError: x is undefined' },
    ];
    expect(significantConsole(entries).map((e) => e.type)).toEqual(['error', 'pageerror']);
    expect(significantConsole(entries, [/Failed to load resource/]).map((e) => e.type)).toEqual([
      'pageerror',
    ]);
  });

  it('reports horizontal overflow beyond the tolerance with its widest offenders', () => {
    expect(overflowFinding({ scrollWidth: 391, clientWidth: 390, offenders: [] })).toBeUndefined();
    const offenders = Array.from({ length: 8 }, (_, i) => ({
      selector: `p${String(i)}`,
      right: 400 + i,
    }));
    const finding = overflowFinding({ scrollWidth: 433, clientWidth: 390, offenders });
    expect(finding?.extra).toBe(43);
    expect(finding?.offenders).toHaveLength(5);
  });

  it('summarizes axe violations', () => {
    expect(axeSummary([{ id: 'color-contrast', help: 'h', nodes: 3, targets: ['a'] }])).toEqual([
      { id: 'color-contrast', impact: 'unknown', help: 'h', nodes: 3, targets: ['a'] },
    ]);
  });
});

describe('report', () => {
  const clean = {
    viewport: 'phone',
    scheme: 'dark',
    file: 'counter/phone-dark.png',
    console: [],
    axe: [],
  };
  const broken = {
    ...clean,
    viewport: 'desktop',
    scheme: 'light',
    file: 'bmi/desktop-light.png',
    console: [{ type: 'error', text: 'boom | bang' }],
    overflow: { extra: 5, offenders: [{ selector: 'input#q', right: 395 }] },
    axe: [{ id: 'color-contrast', impact: 'serious', help: 'Contrast', nodes: 1, targets: ['p'] }],
    diff: { failed: true, reason: '12 px differ (0.010%)', diffFile: 'bmi/diff-desktop-light.png' },
  };

  it('lists every failure kind for a shot', () => {
    expect(shotFailures(clean)).toEqual([]);
    expect(shotFailures(broken)).toEqual([
      '1 console',
      'overflow +5px',
      '1 axe',
      'diff 12 px differ (0.010%)',
    ]);
  });

  it('renders a summary table, details and screenshot links', () => {
    const md = renderReport({
      startedAt: '2026-10-05T00:00:00Z',
      mode: 'compared with baseline',
      examples: [
        { name: 'counter', shots: [clean] },
        { name: 'bmi', shots: [broken] },
      ],
    });
    expect(md).toContain('2 examples, 1 passed, 1 failed. Mode: compared with baseline.');
    expect(md).toContain('| [counter](#counter) | pass | — |');
    expect(md).toContain('| [bmi](#bmi) | **FAIL** |');
    expect(md).toContain('![counter phone dark](counter/phone-dark.png)');
    expect(md).toContain('`boom \\| bang`');
    expect(md).toContain('`input#q` ends at 395px');
    expect(md).toContain('[diff image](bmi/diff-desktop-light.png)');
  });
});
