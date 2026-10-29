#!/usr/bin/env node
// gyral-types: writes the element typings gyral() writes (gyral-1zd.25), for type
// checks that run without Vite (`gyral-types && tsc --noEmit`).
//   gyral-types [--root <dir>] [--dir <src dir>]... [--out <file>]
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeTagMap } from '../compiler/tag-map.js';

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: '.' },
    dir: { type: 'string', multiple: true },
    out: { type: 'string' },
  },
});

const { entries, written } = writeTagMap({
  root: resolve(values.root),
  ...(values.dir === undefined ? {} : { dirs: values.dir }),
  ...(values.out === undefined ? {} : { out: values.out }),
});
const where = values.out ?? '.gyral/elements.d.ts';
console.log(
  `gyral-types: ${String(entries.length)} element${entries.length === 1 ? '' : 's'} ` +
    `${written ? 'written to' : 'unchanged in'} ${where}`,
);
