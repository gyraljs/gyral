import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { hashes } from './corpus.mjs';
import { feedback, grade } from './grader.mjs';

function schema(properties = {}, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}
const string = { type: 'string' };
const tool = (name, description, parameters) => ({
  type: 'function',
  function: { name, description, parameters },
});
export const BASE_TOOLS = [
  tool('list_files', 'List the application files and available frozen documentation.', schema()),
  tool(
    'read_file',
    'Read a source or fixed configuration file.',
    schema({ path: string }, ['path']),
  ),
  tool(
    'write_file',
    'Create or replace a UTF-8 file under src/. No shell or dependency changes.',
    schema({ path: string, content: string }, ['path', 'content']),
  ),
  tool(
    'read_doc',
    'Read a documentation excerpt. Optional query starts the excerpt at the first case-insensitive match. Offset is a character offset; limit is at most 16000 characters.',
    schema(
      {
        path: string,
        query: string,
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 16000 },
      },
      ['path'],
    ),
  ),
  tool(
    'check',
    'Run protected typecheck, build and Chromium behavioral checks on the current source.',
    schema(),
  ),
];

export function safePath(root, path, writable = false) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error('Invalid relative path');
  const file = resolve(root, path);
  if (!file.startsWith(resolve(root) + sep)) throw new Error('Path outside allowed root');
  if (writable && (!path.startsWith('src/') || !/\.(ts|tsx|js|jsx|svelte|css|json)$/.test(path)))
    throw new Error('Only application source files are writable');
  for (let parent = file; parent.startsWith(resolve(root) + sep); parent = dirname(parent)) {
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink())
      throw new Error('Symbolic links are not allowed');
  }
  if (existsSync(file) && !realpathSync(file).startsWith(realpathSync(root) + sep))
    throw new Error('Resolved path outside allowed root');
  return file;
}

export function createTools(corpus, workspace, run, output, mcp, grading = grade) {
  const checks = [];
  const accesses = [];
  const docRoot = join(corpus, 'docs', run.framework);
  const docs = Object.keys(hashes(docRoot));
  if (run.condition === 'gyral-assisted')
    docs.push(...Object.keys(hashes(join(corpus, 'docs/skill'))).map((name) => `skill/${name}`));
  const sourceHashes = () =>
    Object.fromEntries(
      Object.entries(hashes(workspace)).filter(([name]) => name.startsWith('src/')),
    );
  let repairs = 0;
  const execute = async (name, args, remainingMs = 240000) => {
    if (name.startsWith('mcp_') && mcp) {
      accesses.push({ name, arguments: args });
      return mcp.call(name.slice(4), args, remainingMs);
    }
    if (!BASE_TOOLS.some((entry) => entry.function.name === name)) throw new Error('Unknown tool');
    const allowed = {
      list_files: [],
      read_file: ['path'],
      write_file: ['path', 'content'],
      read_doc: ['path', 'query', 'offset', 'limit'],
      check: [],
    }[name];
    if (
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args) ||
      Object.keys(args).some((key) => !allowed.includes(key))
    )
      throw new Error('Invalid tool arguments');
    if (name === 'list_files')
      return { files: Object.keys(hashes(workspace)), documentation: docs };
    if (name === 'read_file') {
      if (
        !args.path?.startsWith('src/') &&
        !['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html'].includes(args.path)
      )
        throw new Error('Read access denied');
      return readFileSync(safePath(workspace, args.path), 'utf8');
    }
    if (name === 'write_file') {
      if (typeof args.content !== 'string' || Buffer.byteLength(args.content) > 100_000)
        throw new Error('Source must be a string of at most 100000 bytes');
      const file = safePath(workspace, args.path, true);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, args.content);
      return { written: args.path, sourceHashes: sourceHashes() };
    }
    if (name === 'read_doc') {
      if (!docs.includes(args.path))
        throw new Error('Documentation path unavailable in this condition');
      const root = args.path.startsWith('skill/') ? join(corpus, 'docs') : docRoot;
      const text = readFileSync(safePath(root, args.path), 'utf8');
      const offset = args.offset ?? 0;
      const limit = args.limit ?? 12000;
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 16000 ||
        (args.query !== undefined && typeof args.query !== 'string')
      )
        throw new Error('Invalid excerpt arguments');
      const match = args.query
        ? text.toLowerCase().indexOf(args.query.toLowerCase(), offset)
        : offset;
      accesses.push({ name, ...args });
      return {
        path: args.path,
        totalCharacters: text.length,
        offset: match,
        excerpt: match < 0 ? 'No match' : text.slice(match, match + limit),
      };
    }
    const hash = JSON.stringify(sourceHashes());
    if (checks.some((check) => !check.passed) && checks.at(-1)?.hash !== hash) repairs++;
    const dir = join(output, `check-${checks.length + 1}`);
    const result = await grading(corpus, workspace, run.framework, run.task, dir, remainingMs);
    checks.push({ hash, passed: result.passed, directory: dir });
    const summary = feedback(result);
    if (result.type.code !== 0)
      summary.typeErrors = readFileSync(join(dir, 'type.log'), 'utf8').slice(-12000);
    if (result.build.code !== 0)
      summary.buildErrors = readFileSync(join(dir, 'build.log'), 'utf8').slice(-12000);
    return summary;
  };
  return {
    execute,
    sourceHashes,
    checks,
    accesses,
    repairs: () => repairs,
    definitions: [...BASE_TOOLS, ...(mcp?.definitions ?? [])],
  };
}
