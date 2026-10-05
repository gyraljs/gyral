// @gyral/mcp: the Gyral MCP server. Most people run the CLI (`npx -y @gyral/mcp`); these
// exports let you embed the server or reuse its pieces.
export { createServer } from './server.js';
export type { ToolOptions } from './tools.js';
export { loadCorpus, refreshDocs } from './corpus.js';
export { getDoc, parseLlmsFull, searchDocs, type SearchHit } from './docs.js';
export { findApi, formatApi, listApi, type ApiResult } from './api.js';
export { checkSnippet, type CheckResult } from './check.js';
export {
  scaffold,
  validTag,
  type Scaffold,
  type ScaffoldFile,
  type ScaffoldKind,
} from './scaffold.js';
export type {
  ApiEntry,
  ApiKind,
  Corpus,
  DocPage,
  DocSection,
  Example,
  ExampleFile,
  SkillFile,
} from './types.js';
