// Rule 7 at build time with parse5 (view/09-template-rules.md "How rule 7 is checked"), and the
// build without it: parse5 is an optional peer dependency, loaded by the compiler only.
import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/view/index.js';
import { buildApp, buildError, VIEW } from './fixture.js';

// The HTML parser turns an <image> start tag into <img> (WHATWG "in body": "A start tag whose
// tag name is image"). The normalizer's structural check doesn't model that rename, so its
// shape says <image> while every spec parser builds <img>: only the comparison sees it.
const IMAGE = ['<p><image src="a.png"></image>', '</p>'];

const files = (strings: readonly string[]): Record<string, string> => ({
  'main.ts': [
    `import { html } from '${VIEW}';`,
    `export const a = html\`${strings.join('${1}')}\`;`,
    `export const b = html\`<p>\${2}</p>\`;`,
  ].join('\n'),
  'other.ts': `import { html } from '${VIEW}';\nexport const c = html\`<i>\${3}</i>\`;`,
});

describe('template compiler: rule 7 with parse5', () => {
  it('passes the structural check, but parse5 sees the repair', async () => {
    expect(() => normalize(IMAGE)).not.toThrow();
    const error = await buildError(files(IMAGE));
    expect(error.message).toContain('[gyral template rule 7]');
    expect(error.message).toContain('The HTML parser (parse5) built a different DOM');
    expect(error.message).toContain('at path [0, 0]: expected <image>, found <img>');
    expect(error.message).toMatch(/> 2 \| export const a = html`<p><image/);
  });

  it('accepts what parse5 parses the same way', async () => {
    const { code } = await buildApp(
      files(['<table><tbody><tr><td>', '</td></tr></tbody></table>']),
    );
    expect(code).toContain('compiled(');
  });

  it('skips the check with a one-time notice when parse5 cannot be resolved', async () => {
    const { code, logs } = await buildApp(
      { ...files(IMAGE), 'main.ts': `import './other';\n${files(IMAGE)['main.ts'] ?? ''}` },
      { compiler: { parse5: 'parse5-is-not-installed' } },
    );
    expect(code).toContain('compiled(');
    const notices = logs.filter((l) => l.includes('parse5-is-not-installed is not installed'));
    expect(notices).toHaveLength(1);
  });

  it('can be turned off', async () => {
    const { logs } = await buildApp(files(IMAGE), { compiler: { parse5: false } });
    expect(logs.join('\n')).not.toContain('parse5');
  });
});
