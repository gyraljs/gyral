// Proves the CSS Baseline policy (ADR 0003, stylelint.config.mjs): non-widely-available
// features fail unless guarded, and the documented guard patterns pass.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const configFile = join(root, 'stylelint.config.mjs');

async function problems(code, file = 'fixture.css') {
  const { results } = await stylelint.lint({ code, codeFilename: join(root, file), configFile });
  return results.flatMap((r) => r.warnings.map((w) => w.text));
}

describe('CSS Baseline policy', () => {
  it('rejects unguarded features that are not widely available', async () => {
    expect(await problems('h1 { text-wrap: balance; }')).toHaveLength(1);
    expect(await problems(':root { --c: light-dark(white, black); }')).toHaveLength(1);
  });

  it('accepts the documented guard patterns', async () => {
    expect(await problems('@supports (text-wrap: balance) { h1 { text-wrap: balance; } }')).toEqual(
      [],
    );
    expect(
      await problems(
        ':root { --c: white; } @supports (color: light-dark(black, white)) { :root { --c: light-dark(white, black); } }',
      ),
    ).toEqual([]);
    expect(await problems('@starting-style { li { opacity: 0; } }')).toEqual([]);
  });

  it('reads css`` templates in TypeScript', async () => {
    const ts =
      'import { css } from "@gyral/core";\nexport const s = css`h1 { text-wrap: balance; }`;\n';
    expect(await problems(ts, 'packages/core/src/fixture.ts')).toHaveLength(1);
  });
});
