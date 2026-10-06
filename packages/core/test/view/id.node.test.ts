// view/01-templates.md "Template ids": deterministic, at least 52 bits, base 36, computed from
// the normalized strings; the development registry warns on collisions.
import { describe, expect, it, vi } from 'vitest';
import { recordTemplateId, templateId } from '../../src/view/normalize/id.js';
import { normalize } from '../../src/view/normalize/normalize.js';
import { t } from './helpers.js';

describe('template ids (view/01)', () => {
  it('are stable: the same strings give the same id, pinned across runtimes', () => {
    expect(templateId(['<p>', '</p>'])).toBe(templateId(['<p>', '</p>']));
    // Pinned values: the compiler, browsers and Node must agree on them forever.
    expect(templateId([''])).toBe('1zcjtrv9c6z');
    expect(templateId(['<p>Hello ', '!</p>'])).toBe('xdzcxyuehv');
  });

  it('come from the normalized strings, so whitespace-only edits keep the id', () => {
    const a = normalize(t`<ul>
        <li>${1}</li>
      </ul>`);
    const b = normalize(t`<ul><li>${1}</li></ul>`);
    expect(a.id).toBe(b.id);
  });

  it('differ when strings differ, including where holes split them', () => {
    const ids = [
      templateId(['ab']),
      templateId(['a', 'b']),
      templateId(['', 'ab']),
      templateId(['ab', '']),
      templateId(['ba']),
      templateId(['<p class="a">', '</p>']),
      templateId(['<p class="b">', '</p>']),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('are base-36 strings of at most 53 bits, with no collisions in 200k templates', () => {
    const seen = new Set<string>();
    const malformed: string[] = [];
    for (let k = 0; k < 200_000; k++) {
      const id = templateId([`<li class="row-${String(k)}">`, `</li>`]);
      // One expect at the end: 200k expect() calls took seconds and timed out under load.
      if (!/^[0-9a-z]{1,11}$/.test(id)) malformed.push(id);
      seen.add(id);
    }
    expect(malformed).toEqual([]);
    expect(seen.size).toBe(200_000);
    expect(Number.isSafeInteger(parseInt(templateId(['x']), 36))).toBe(true);
  });

  it('warns in development when two different templates share an id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      recordTemplateId('same', ['<p>', '</p>']);
      recordTemplateId('same', ['<p>', '</p>']);
      expect(warn).not.toHaveBeenCalled();
      recordTemplateId('same', ['<b>', '</b>']);
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain('share the id same');
    } finally {
      warn.mockRestore();
    }
  });
});
