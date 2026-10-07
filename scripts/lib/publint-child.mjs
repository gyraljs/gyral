// publint for one tarball, in its own process (pack-check.mjs). publint loads es-module-lexer's
// WebAssembly and fflate, and a Node process that exits while those are tearing down can hang in
// exit for good (seen on CI for the v0.3.0 release PR: every check printed ok, then the job sat
// until its 30-minute timeout). pack-check reads this process's one line of JSON and stops it,
// so its own exit never depends on this one's.
//   node scripts/lib/publint-child.mjs <tarball>
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

const tarball = process.argv[2];
if (tarball === undefined) throw new Error('usage: publint-child.mjs <tarball>');
const packed = JSON.parse(
  execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
);
// Copy out exactly the file's bytes: a small Buffer can be a view into Node's shared pool,
// so `.buffer` alone would hand publint unrelated data ("incorrect header check").
const bytes = readFileSync(tarball);
const lint = await publint({
  pack: { tarball: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
  level: 'suggestion',
  strict: true,
});
const messages = lint.messages.map((message) => formatMessage(message, packed));
process.stdout.write(`${JSON.stringify({ messages })}\n`);
