// The MCP tools. Each answers in compact markdown sized for an agent's context window.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { explainInternal, findApi, formatApi, listApi } from './api.js';
import { checkSnippet } from './check.js';
import { getDoc, searchDocs } from './docs.js';
import { findExample, formatExample, listExamples } from './examples.js';
import { orientation, workflow } from './orientation.js';
import { readInstalled, UNKNOWN, withListed } from './project.js';
import { scaffold, validTag } from './scaffold.js';
import type { Corpus } from './types.js';

export type ToolOptions =
  | { readonly projectDir: string; readonly snippetChecks?: true }
  | { readonly snippetChecks: false; readonly projectDir?: never };

const text = (body: string, isError = false) => ({
  content: [{ type: 'text' as const, text: body }],
  ...(isError ? { isError: true } : {}),
});

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

export function registerTools(server: McpServer, corpus: Corpus, options: ToolOptions): void {
  const local = options.snippetChecks !== false;
  const flow = workflow(local);

  server.registerTool(
    'start_here',
    {
      title: 'Start here: how to build with Gyral',
      description: `Call this first, once per task. A short orientation for Gyral ${corpus.version}: the mental model, the rules agents most often break, the recommended workflow, which tool to use when, and an index from use case (form, fetch, search, routing, SSR, …) to the example and guide to start from. ${flow}`,
      annotations: readOnly,
    },
    () => text(orientation(corpus, local)),
  );

  server.registerTool(
    'search_docs',
    {
      title: 'Search the Gyral docs',
      description: `Search the Gyral ${corpus.version} documentation (guides, API reference, examples) for one concept you need. Returns ranked sections with their URL; pass a URL to get_doc for the full text. Don't read the docs end to end before writing code. ${flow}`,
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
      description: `Returns one docs page as markdown, or one section when the reference has a #anchor (prefer a section: pages are long). Accepts a URL (https://gyral.dev/docs/forms/#the-server-half), a path (/docs/intent/) or a short name (intent, forms#the-server-half, api/core, examples). ${flow}`,
      inputSchema: {
        path_or_url: z
          .string()
          .min(1)
          .optional()
          .describe('URL, path or page name, optionally with #anchor.'),
        path: z.string().min(1).optional().describe('Same as path_or_url (an alias).'),
      },
      annotations: readOnly,
    },
    ({ path_or_url, path }) => {
      const ref = path_or_url ?? path;
      if (ref === undefined)
        return text('Pass path_or_url (or path): a URL, a path or a page name like "forms".', true);
      const doc = getDoc(corpus.docs, ref);
      if (doc !== undefined) return text(doc);
      const pages = corpus.docs.map((p) => `- ${p.title}: ${p.url}`).join('\n');
      return text(`No page or section matches "${ref}". Pages:\n${pages}`, true);
    },
  );

  server.registerTool(
    'get_api',
    {
      title: 'Look up a Gyral API symbol',
      description: `Declaration, doc comment and import path of one public @gyral/* export (e.g. define, form, renderPage, step) you are about to use. A miss suggests the nearest export names, and for an unexported helper type says how to name it. Not for browsing the type graph: start from get_example or scaffold_component instead. Pass "*" to list every export, optionally for one package. ${flow}`,
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
      // `StandardSchemaV1.Issue`, `prop.string`: the part before the dot.
      const head = symbol.trim().split('.')[0] ?? '';
      if (head !== symbol.trim() && head !== '') {
        const outer = findApi(corpus.api, head, pkg).matches;
        if (outer.length > 0)
          return text(
            `\`${symbol.trim()}\` is a member of \`${head}\`:\n\n${outer.map(formatApi).join('\n\n')}`,
          );
      }
      const internal = explainInternal(corpus.internalTypes, symbol);
      if (internal !== undefined) return text(internal);
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
      description: `Every runnable example in the Gyral repo with what it demonstrates. Read the closest one with get_example and adapt it. ${flow}`,
      annotations: readOnly,
    },
    () => text(listExamples(corpus.examples)),
  );

  server.registerTool(
    'get_example',
    {
      title: 'Read a Gyral example',
      description: `Workflow step 1: working code to start from. An example's description, link and the full source of its component files (start_here maps use cases to examples). Adapt it into a minimal implementation right away. ${flow}`,
      inputSchema: {
        name: z.string().min(1).describe('Example name from list_examples, e.g. "hello-world".'),
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
      description: `Workflow step 1: idiomatic starting code that imports only packages the project has installed${local ? " (read from the project's package.json)" : ' (pass installed)'}. "basic" (state, intents, pure update, view; a model test when @gyral/testing and vitest are installed), "form" (with valibot or zod 4 installed: a schema shared with the server; otherwise the dependency-free form), "form-native" (no dependencies: novalidate plus the browser's constraint checks, custom messages, focus on the first invalid field), "ssr-page" (light-DOM page, client entry, and a server route when @gyral/ssr is installed). Adapt it into a minimal implementation right away. ${flow}`,
      inputSchema: {
        tag: z.string().min(1).describe('Custom element name with a hyphen, e.g. "todo-list".'),
        kind: z
          .enum(['basic', 'form', 'form-native', 'ssr-page'])
          .describe('Which starting point.'),
        description: z
          .string()
          .optional()
          .describe('What the component should do (added as a comment).'),
        ...(local
          ? {
              project_dir: z
                .string()
                .optional()
                .describe(
                  "The project whose package.json says what is installed (default: the server's project directory). Relative paths start there.",
                ),
            }
          : {}),
        installed: z
          .array(z.string())
          .optional()
          .describe(
            'Package names the project has installed, e.g. ["@gyral/core", "vitest", "@gyral/testing", "valibot"]. Added to what package.json says; without either, only @gyral/core is assumed.',
          ),
      },
      annotations: readOnly,
    },
    (args) => {
      const { tag, kind, description, installed } = args;
      const problem = validTag(tag);
      if (problem !== undefined) return text(problem, true);
      const dir = 'project_dir' in args ? args.project_dir : undefined;
      const base =
        options.projectDir === undefined
          ? UNKNOWN
          : readInstalled(resolve(options.projectDir, typeof dir === 'string' ? dir : '.'));
      const result = scaffold(tag, kind, description, withListed(base, installed));
      const files = result.files
        .map((f) => `\`${f.path}\`:\n\n\`\`\`ts\n${f.code.trimEnd()}\n\`\`\``)
        .join('\n\n');
      const next = local
        ? 'Next: write the minimal implementation, then check_snippet each file and apply the suggested fixes.'
        : 'Next: write the minimal implementation, then typecheck it in the project.';
      return text(`${files}\n\nNotes:\n${result.notes.map((n) => `- ${n}`).join('\n')}\n\n${next}`);
    },
  );

  if (options.snippetChecks === false) return;
  server.registerTool(
    'check_snippet',
    {
      title: 'Typecheck TypeScript against Gyral',
      description: `Workflow step 3, after writing code: typechecks a TypeScript module against the project's installed TypeScript and @gyral/* types (the server's working directory, or GYRAL_PROJECT_DIR) and returns each error with a suggested fix, plus common Gyral mistakes TypeScript can't see (one-call define, listen in init, periodic, side effects in update, handlers in views, rows without a TemplateResult return type). Apply the fixes and call it again until it passes. Use it before presenting Gyral code. ${flow}`,
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
