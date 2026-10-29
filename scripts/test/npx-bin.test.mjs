import { describe, expect, it } from 'vitest';
import { npxBinProblem, RUN_BY_NAME } from '../lib/npx-bin.mjs';

describe('npx bin selection (pack:check)', () => {
  it('accepts one bin, a string bin, or a bin named after the unscoped package', () => {
    expect(npxBinProblem('@gyral/mcp', { 'gyral-mcp': './dist/cli.js' })).toBeUndefined();
    expect(npxBinProblem('create-gyral', './dist/cli.js')).toBeUndefined();
    expect(npxBinProblem('@gyral/mcp', { mcp: './a.js', 'gyral-mcp': './b.js' })).toBeUndefined();
  });

  it("rejects 0.3.2's two unnamed bins and a missing bin", () => {
    expect(
      npxBinProblem('@gyral/mcp', {
        'gyral-mcp': './dist/cli.js',
        'gyral-mcp-http': './dist/http-cli.js',
      }),
    ).toBe("bins gyral-mcp, gyral-mcp-http: needs exactly one bin, or one named 'mcp'");
    expect(npxBinProblem('create-gyral', undefined)).toBe('no bin');
    expect(npxBinProblem('create-gyral', {})).toBe('no bin');
  });

  it('covers the packages documented as `npx` / `npm create` commands', () => {
    expect(RUN_BY_NAME).toEqual(['@gyral/mcp', '@gyral/codemod', 'create-gyral']);
  });
});
