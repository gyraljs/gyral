// `gyral-mcp skill` (gyral-337.4): writes the bundled Gyral skill into an app's agent folders for
// the app's installed @gyral/core version, and `--check` fails when a copy differs.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs, SKILL_USAGE } from '../src/cli-args.js';
import { syncSkill } from '../src/skill-cli.js';
import type { Corpus } from '../src/types.js';

const corpus = {
  version: '0.3.8',
  skill: [
    { path: 'SKILL.md', content: '# Gyral\n' },
    { path: 'references/intent.md', content: '# Intent\n' },
  ],
} as unknown as Corpus;

const apps: string[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) rmSync(app, { recursive: true, force: true });
});

/** An app with @gyral/core `version` installed. */
function app(version = '0.3.8'): string {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-skill-'));
  apps.push(dir);
  mkdirSync(join(dir, 'node_modules/@gyral/core'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/@gyral/core/package.json'), JSON.stringify({ version }));
  return dir;
}

const run = (project: string, check = false, dirs: string[] = []) =>
  syncSkill(corpus, { project, dirs, check });

describe('gyral-mcp skill', () => {
  it('writes the skill to .claude/skills/gyral, and then checks it', () => {
    const dir = app();
    expect(run(dir).ok).toBe(true);
    expect(readFileSync(join(dir, '.claude/skills/gyral/references/intent.md'), 'utf8')).toBe(
      '# Intent\n',
    );
    expect(run(dir, true)).toEqual({
      ok: true,
      lines: ['.claude/skills/gyral: the Gyral 0.3.8 skill'],
    });
  });

  it('fails the check for a changed, missing or stale file, and a write fixes it', () => {
    const dir = app();
    run(dir);
    writeFileSync(join(dir, '.claude/skills/gyral/SKILL.md'), '# edited\n');
    writeFileSync(join(dir, '.claude/skills/gyral/references/old.md'), 'gone\n');
    const result = run(dir, true);
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('.claude/skills/gyral/SKILL.md differs');
    expect(result.lines.join('\n')).toContain('references/old.md is not in the skill');
    expect(result.lines.at(-1)).toBe('Run `npx @gyral/mcp@0.3.8 skill` to update.');
    expect(run(dir).lines).toEqual([
      '.claude/skills/gyral: the Gyral 0.3.8 skill (1 written, 1 removed)',
    ]);
    expect(existsSync(join(dir, '.claude/skills/gyral/references/old.md'))).toBe(false);
    expect(run(dir, true).ok).toBe(true);
  });

  it('keeps .agents/skills/gyral too when it exists, or exactly the --dir folders', () => {
    const dir = app();
    mkdirSync(join(dir, '.agents/skills/gyral'), { recursive: true });
    run(dir);
    expect(readFileSync(join(dir, '.agents/skills/gyral/SKILL.md'), 'utf8')).toBe('# Gyral\n');
    const other = app();
    run(other, false, ['docs/agents/gyral']);
    expect(existsSync(join(other, 'docs/agents/gyral/SKILL.md'))).toBe(true);
    expect(existsSync(join(other, '.claude'))).toBe(false);
  });

  // gyral-vbm: an absolute --dir (a user-level copy) was joined onto the project.
  it('writes an absolute --dir where it points, and names it in full', () => {
    const dir = app();
    const user = app();
    const target = join(user, '.claude/skills/gyral');
    expect(run(dir, false, [target]).lines).toEqual([
      `${target}: the Gyral 0.3.8 skill (3 written, 0 removed)`,
    ]);
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toBe('# Gyral\n');
    expect(existsSync(join(dir, user))).toBe(false);
    expect(run(dir, true, [target]).lines).toEqual([`${target}: the Gyral 0.3.8 skill`]);
    // A folder in the project prints relative to it, however it was given.
    expect(run(dir, false, [join(dir, 'agents/gyral/')]).lines[0]).toMatch(/^agents\/gyral: /);
  });

  // gyral-337.18: the files an owner keeps beside a vendored or user-level copy.
  it("keeps the owner's LICENSE, NOTICE, PINNED and SOURCE files beside the skill", () => {
    const dir = app();
    const skill = join(dir, '.claude/skills/gyral');
    mkdirSync(join(skill, 'references'), { recursive: true });
    const owner = ['LICENSE', 'NOTICE', 'PINNED.txt', 'SOURCE-gyral.md', 'COPYING.md'];
    for (const name of owner) writeFileSync(join(skill, name), 'mine\n');
    writeFileSync(join(skill, 'references/LICENSE'), 'not beside the skill\n');
    writeFileSync(join(skill, 'notes.md'), 'not an owner file\n');
    expect(run(dir).lines).toEqual([
      '.claude/skills/gyral: the Gyral 0.3.8 skill (3 written, 2 removed; kept COPYING.md, LICENSE, NOTICE, PINNED.txt, SOURCE-gyral.md)',
    ]);
    for (const name of owner) expect(readFileSync(join(skill, name), 'utf8')).toBe('mine\n');
    expect(existsSync(join(skill, 'references/LICENSE'))).toBe(false);
    expect(existsSync(join(skill, 'notes.md'))).toBe(false);
    expect(run(dir, true)).toEqual({
      ok: true,
      lines: [
        '.claude/skills/gyral: the Gyral 0.3.8 skill (kept COPYING.md, LICENSE, NOTICE, PINNED.txt, SOURCE-gyral.md)',
      ],
    });
  });

  it('writes a VERSION file naming the release and its source, which --check compares', () => {
    const dir = app();
    run(dir);
    expect(readFileSync(join(dir, '.claude/skills/gyral/VERSION'), 'utf8')).toBe(
      [
        '0.3.8',
        '',
        'The Gyral 0.3.8 skill, from https://github.com/gyraljs/gyral/tree/v0.3.8/skills/gyral',
        'Written by `npx @gyral/mcp@0.3.8 skill`; its `--check` fails when this folder differs.',
        '',
      ].join('\n'),
    );
    writeFileSync(join(dir, '.claude/skills/gyral/VERSION'), '0.3.7\n');
    expect(run(dir, true).lines[0]).toBe('.claude/skills/gyral/VERSION differs');
  });

  it("refuses another release's core, naming the command that has its skill", () => {
    const dir = app('0.3.9');
    expect(run(dir)).toEqual({
      ok: false,
      lines: [
        `@gyral/core 0.3.9 is installed in ${dir}, but this is the skill of Gyral 0.3.8. Run \`npx @gyral/mcp@0.3.9 skill\`.`,
      ],
    });
    expect(existsSync(join(dir, '.claude'))).toBe(false);
  });

  it('parses its arguments', () => {
    expect(parseArgs(['skill'])).toEqual({ kind: 'skill', check: false, dirs: [] });
    expect(parseArgs(['skill', '--check', '--dir', 'a', '--dir', 'b'])).toEqual({
      kind: 'skill',
      check: true,
      dirs: ['a', 'b'],
    });
    expect(parseArgs(['skill', '--help'])).toEqual({ kind: 'help', text: SKILL_USAGE });
    expect(parseArgs(['help', 'skill'])).toEqual({ kind: 'help', text: SKILL_USAGE });
    expect(parseArgs(['skill', '--dir'])).toMatchObject({ kind: 'error' });
  });
});
