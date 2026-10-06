// The server's synchronous SHA-256 (view/server/sha256.ts, view/06-server.md "CSP") gives the
// same digests as node:crypto, at every padding boundary and for arbitrary text, and
// styleHashSync gives the same CSP hash as the async styleHash.
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../../src/view/server/sha256.js';
import { styleHash, styleHashSync } from '../../src/server.js';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const reference = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('sha256', () => {
  it('matches the FIPS 180-4 examples', () => {
    const utf8 = (s: string) => new TextEncoder().encode(s);
    expect(hex(sha256(utf8('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hex(sha256(utf8('')))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(hex(sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches node:crypto at every length around the padding boundaries', () => {
    for (let n = 0; n <= 200; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n) & 0xff);
      expect(hex(sha256(bytes))).toBe(reference(bytes));
    }
    const big = new Uint8Array(100_000).fill(0x61);
    expect(hex(sha256(big))).toBe(reference(big));
  });

  it('matches node:crypto for arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) => {
        expect(hex(sha256(bytes))).toBe(reference(bytes));
      }),
    );
  });

  it('styleHashSync is the CSP hash of the text, CR/CRLF read as LF, same as styleHash', async () => {
    const css = 'p {\r\n  color: rgb(1, 2, 3);\r}\n';
    const want = `'sha256-${createHash('sha256').update('p {\n  color: rgb(1, 2, 3);\n}\n').digest('base64')}'`;
    expect(styleHashSync(css)).toBe(want);
    expect(await styleHash(css)).toBe(want);
  });
});
