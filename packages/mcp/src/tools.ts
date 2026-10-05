// The MCP tools. Each answers in compact markdown sized for an agent's context window.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findApi, formatApi, listApi } from './api.js';
import { checkSnippet } from './check.js';
import { getDoc, searchDocs } from './docs.js';
import { findExample, formatExample, listExamples } from './examples.js';
import { scaffold, validTag } from './scaffold.js';
import type { Corpus } from './types.js';

export interface ToolOptions {
  /** Where check_snippet resolves TypeScript and @gyral/* (the agent's project). */
  readonly projectDir: string;
}

const text = (body: string, isError = false) => ({
  content: [{ type: 'text' as const, text: body }],
  ...(isError ? { isError: true } : {}),
});

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

export function registerTools(server: McpServer, corpus: Corpus, options: ToolOptions): void {
  server.registerTool(
    'search_docs',
    {
      title: 'Search the Gyral docs',
      description: `Search the Gyral ${corpus.version} documentation (guides, API reference, examples). Returns ranked sections with their URL; pass a URL to get_doc for the full text.`,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('Words to look for, e.g. "hydrate island" or "formAction 422".'),
        limit: z.number().int().min(1).max(20).optional().describe('Maximum results (default 8).'),
      },
      annotations: readOnly,
    },
    ({ query, limit }) => {
      const hits = searchDocs(corpus.docs, query, limit ?? 8);
      if (hits.length === 0)
        return text(`No results for "${query}". Try other words, or get_doc "docs".`);
      return text(
        hits
          .map(
            (h, n) =>
              `${String(n + 1)}. **${h.page} › ${h.section || 'Overview'}**\n   ${h.url}\n   ${h.snippet}`,
          )
          .join('\n\n'),
      );
    },
  );

  server.registerTool(
    'get_doc',
    {
      title: 'Read a Gyral docs page or section',
      description:
        'Returns one docs page as markdown, or one section when the reference has a #anchor. Accepts a URL (https://gyral.dev/docs/forms/#the-server-half), a path (/docs/intent/) or a short name (intent, api/core, examples).',
      inputSchema: {
        path_or_url: z.string().min(1).describe('URL, path or page name, optionally with #anchor.'),
      },
      annotations: readOnly,
    },
    ({ path_or_url }) => {
      const doc = getDoc(corpus.docs, path_or_url);
      if (doc !== undefined) return text(doc);
      const pages = corpus.docs.map((p) => `- ${p.title}: ${p.url}`).join('\n');
      return text(`No page or section matches "${path_or_url}". Pages:\n${pages}`, true);
    },
  );

  server.registerTool(
    'get_api',
    {
      title: 'Look up a Gyral API symbol',
      description:
        'Declaration, doc comment and import path of a public @gyral/* export (e.g. define, form, renderPage, step). Pass "*" to list every export, optionally for one package.',
      inputSchema: {
        symbol: z.string().min(1).describe('Exported name, e.g. "define", or "*" for the index.'),
        package: z
          .string()
          .optional()
          .describe('Limit to a package or entry point: "core", "@gyral/ssr/static".'),
      },
      annotations: readOnly,
    },
    ({ symbol, package: pkg }) => {
      if (symbol.trim() === '*')
        return text(listApi(corpus.api, pkg) || `No exports for package "${pkg ?? ''}".`);
      const { matches, suggestions } = findApi(corpus.api, symbol, pkg);
      if (matches.length > 0) return text(matches.map(formatApi).join('\n\n'));
      const hint =
        suggestions.length > 0
          ? ` Did you mean: ${suggestions.join(', ')}?`
          : ' Pass "*" to list exports.';
      return text(
        `No public export named "${symbol}"${pkg === undefined ? '' : ` in ${pkg}`}.${hint}`,
        true,
      );
    },
  );

  server.registerTool(
    'list_examples',
    {
      title: 'List the Gyral examples',
      description:
        'Every runnable example in the Gyral repo with what it demonstrates. Read one with get_example.',
      annotations: readOnly,
    },
    () => text(listExamples(corpus.examples)),
  );

  server.registerTool(
    'get_example',
    {
      title: 'Read a Gyral example',
      description: "An example's description, link and the full source of its component files.",
      inputSchema: {
        name: z.string().min(1).describe('Example name from list_examples, e.g. "counter".'),
      },
      annotations: readOnly,
    },
    ({ name }) => {
      const example = findExample(corpus.examples, name);
      if (example !== undefined) return text(formatExample(example));
      return text(
        `No example "${name}". Available: ${corpus.examples.map((e) => e.name).join(', ')}.`,
        true,
      );
    },
  );

  server.registerTool(
    'scaffold_component',
    {
      title: 'Scaffold a Gyral component',
      description:
        'Idiomatic starting code: "basic" (state, intents, pure update, view, model test), "form" (schema-validated form that also works without JavaScript), "ssr-page" (light-DOM page, server route, client entry). Adapt it, then run check_snippet.',
      inputSchema: {
        tag: z.string().min(1).describe('Custom element name with a hyphen, e.g. "todo-list".'),
        kind: z.enum(['basic', 'form', 'ssr-page']).describe('Which starting point.'),
        description: z
          .string()
          .optional()
          .describe('What the component should do (added as a comment).'),
      },
      annotations: readOnly,
    },
    ({ tag, kind, description }) => {
      const problem = validTag(tag);
      if (problem !== undefined) return text(problem, true);
      const result = scaffold(tag, kind, description);
      const files = result.files
        .map((f) => `\`${f.path}\`:\n\n\`\`\`ts\n${f.code.trimEnd()}\n\`\`\``)
        .join('\n\n');
      return text(`${files}\n\nNotes:\n${result.notes.map((n) => `- ${n}`).join('\n')}`);
    },
  );

  server.registerTool(
    'check_snippet',
    {
      title: 'Typecheck TypeScript against Gyral',
      description:
        "Typechecks a TypeScript module against the project's installed TypeScript and @gyral/* types (the server's working directory, or GYRAL_PROJECT_DIR). Use it before presenting Gyral code.",
      inputSchema: {
        code: z.string().min(1).describe('A complete TypeScript module, imports included.'),
      },
      annotations: readOnly,
    },
    ({ code }) => {
      const result = checkSnippet(code, options.projectDir);
      return text(result.report, !result.ran);
    },
  );
}
