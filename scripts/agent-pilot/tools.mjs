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
import { DOC_LIMITS, getDoc, listDocs, loadLibrary, searchDocs, tokens } from './docs.mjs';
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
  tool('list_files', 'List the application files.', schema()),
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
    'list_docs',
    'List every documentation page: page id, title, group and a one-line description.',
    schema(),
  ),
  tool(
    'search_docs',
    `Ranked keyword search over documentation headings and text. Returns page ids, section headings and snippets. limit is 1-${DOC_LIMITS.searchMax} (default ${DOC_LIMITS.searchDefault}).`,
    schema(
      { query: string, limit: { type: 'integer', minimum: 1, maximum: DOC_LIMITS.searchMax } },
      ['query'],
    ),
  ),
  tool(
    'get_doc',
    `Read a documentation page by page id, or only one section of it by heading text. Long pages and sections return their first ${DOC_LIMITS.pageCharacters} characters and an outline of the headings you can request.`,
    schema({ page: string, section: string }, ['page']),
  ),
  tool(
    'check',
    'Run protected typecheck, build and Chromium behavioral checks on the current source.',
    schema(),
  ),
];
const ARGUMENTS = {
  list_files: [],
  read_file: ['path'],
  write_file: ['path', 'content'],
  list_docs: [],
  search_docs: ['query', 'limit'],
  get_doc: ['page', 'section'],
  check: [],
};
export const DOC_TOOLS = new Set([
  'list_docs',
  'search_docs',
  'get_doc',
  'mcp_search_docs',
  'mcp_get_doc',
  'mcp_get_api',
  'mcp_list_examples',
  'mcp_get_example',
  'mcp_get_prompt',
  'mcp_read_resource',
]);

/** The documentation directories a condition can read: the same base docs, plus the skill. */
export function libraryDirectories(corpus, run) {
  const dirs = [join(corpus, 'docs', run.framework)];
  if (run.condition === 'gyral-assisted') dirs.push(join(corpus, 'docs/skill'));
  return dirs;
}

const sortedJson = (value) =>
  JSON.stringify(value, (key, inner) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

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
  const library = loadLibrary(libraryDirectories(corpus, run));
  // First request at which each documentation read (by content) was returned.
  const seen = new Map();
  let request = 0;
  const sourceHashes = () =>
    Object.fromEntries(
      Object.entries(hashes(workspace)).filter(([name]) => name.startsWith('src/')),
    );
  let repairs = 0;
  const repeated = (key, result) => {
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, request);
      return { repeat: false, result };
    }
    return {
      repeat: true,
      result: {
        warning: `Repeat read: this returns the same content as your call in request ${first}. Nothing has changed since.`,
        ...(result && typeof result === 'object' && !Array.isArray(result) ? result : { result }),
      },
    };
  };
  const record = (name, args, extra = {}) => {
    const entry = { request, name, arguments: args, ...extra };
    accesses.push(entry);
    return entry;
  };
  const execute = async (name, args, remainingMs = 240000) => {
    if (name.startsWith('mcp_') && mcp) {
      const entry = record(name, args);
      const { repeat, result } = repeated(`${name}:${sortedJson(args)}`, null);
      entry.repeat = repeat;
      const answer = await mcp.call(name.slice(4), args, remainingMs);
      return repeat ? { ...result, result: answer } : answer;
    }
    if (!BASE_TOOLS.some((entry) => entry.function.name === name)) throw new Error('Unknown tool');
    const allowed = ARGUMENTS[name];
    if (
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args) ||
      Object.keys(args).some((key) => !allowed.includes(key))
    )
      throw new Error('Invalid tool arguments');
    if (name === 'list_files')
      return {
        files: Object.keys(hashes(workspace)),
        documentation: 'Use list_docs, search_docs and get_doc.',
      };
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
      record(name, { path: args.path }, { bytes: Buffer.byteLength(args.content) });
      return { written: args.path, sourceHashes: sourceHashes() };
    }
    if (name === 'list_docs') {
      const entry = record(name, args);
      const { repeat, result } = repeated('list_docs', listDocs(library));
      entry.repeat = repeat;
      return result;
    }
    if (name === 'search_docs') {
      const found = searchDocs(library, args.query, args.limit ?? DOC_LIMITS.searchDefault);
      const entry = record(name, args);
      const key = `search:${tokens(args.query).sort().join(' ')}:${args.limit ?? DOC_LIMITS.searchDefault}`;
      const { repeat, result } = repeated(key, found);
      entry.repeat = repeat;
      return result;
    }
    if (name === 'get_doc') {
      const found = getDoc(library, args.page, args.section);
      const entry = record(name, args, { resolved: found.key ?? null });
      if (!found.key) return found;
      const { key, ...shown } = found;
      const { repeat, result } = repeated(`doc:${key}`, shown);
      entry.repeat = repeat;
      return result;
    }
    const hash = JSON.stringify(sourceHashes());
    if (checks.some((check) => !check.passed) && checks.at(-1)?.hash !== hash) repairs++;
    const dir = join(output, `check-${checks.length + 1}`);
    const result = await grading(corpus, workspace, run.framework, run.task, dir, remainingMs);
    checks.push({
      request,
      hash,
      passed: result.passed,
      infrastructure: Boolean(result.infrastructure),
      directory: dir,
    });
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
    library,
    setRequest: (value) => {
      request = value;
    },
    repairs: () => repairs,
    definitions: [...BASE_TOOLS, ...(mcp?.definitions ?? [])],
  };
}
