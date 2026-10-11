// @gyral/mcp: the Gyral MCP server. Most people run the CLI (`npx -y @gyral/mcp`); these exports
// embed the server in another process. The tools' building blocks are internal.
export { createServer } from './server.js';
export type { ToolOptions } from './tools.js';
export { loadCorpus, refreshDocs } from './corpus.js';
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
