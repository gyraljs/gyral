// The Gyral MCP server: tools (tools.ts), the llms.txt and skill resources, and a prompt that
// walks an agent through building a component the Gyral way.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerTools, type ToolOptions } from './tools.js';
import type { Corpus } from './types.js';

const INSTRUCTIONS = `Gyral builds web components as Model-View-Intent loops with their own view layer (html, css, each, prop from @gyral/core): intent parses DOM events into typed messages, update is one pure reducer per message, view is a pure function of state that names intents with data-intent (no event handlers), and side effects are commands performed by drivers. Read the gyral://skill resource first. Use search_docs / get_doc for guides, get_api for exact signatures, get_example for working code, scaffold_component for a starting point, and check_snippet before presenting code.`;

function registerResources(server: McpServer, corpus: Corpus): void {
  server.registerResource(
    'llms-txt',
    'gyral://llms.txt',
    {
      title: 'Gyral llms.txt',
      description:
        'Overview of Gyral and an index of its documentation (https://gyral.dev/llms.txt).',
      mimeType: 'text/plain',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: corpus.llmsTxt }] }),
  );

  const skill = corpus.skill.find((f) => f.path === 'SKILL.md');
  server.registerResource(
    'skill',
    'gyral://skill',
    {
      title: 'Gyral agent skill',
      description:
        'How to build with Gyral: the component shape, golden rules and decision tables.',
      mimeType: 'text/markdown',
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: skill?.content ?? '' }],
    }),
  );

  const references = corpus.skill.filter((f) => f.path.startsWith('references/'));
  server.registerResource(
    'skill-reference',
    new ResourceTemplate('gyral://skill/references/{name}', {
      list: () => ({
        resources: references.map((f) => ({
          uri: `gyral://skill/${f.path}`,
          name: f.path,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    {
      title: 'Gyral skill reference',
      description: 'One reference page of the Gyral skill (components.md, forms.md, ssr.md, …).',
      mimeType: 'text/markdown',
    },
    (uri, variables) => {
      const name = String(variables.name ?? '');
      const file = references.find((f) => f.path === `references/${name}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: file?.content ?? `No reference "${name}".`,
          },
        ],
      };
    },
  );
}

function registerPrompts(server: McpServer, corpus: Corpus): void {
  const skill = corpus.skill.find((f) => f.path === 'SKILL.md')?.content ?? '';
  server.registerPrompt(
    'build-gyral-component',
    {
      title: 'Build a Gyral component',
      description: 'Plan, write and verify a Gyral component following the framework rules.',
      argsSchema: {
        tag: z.string().describe('Custom element name, e.g. "todo-list".'),
        description: z.string().describe('What the component should do.'),
      },
    },
    ({ tag, description }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Build a Gyral ${corpus.version} component <${tag}>: ${description}

Follow the Gyral skill below. Work in this order:
1. Write the State interface and the Msg tagged union first (one tag per thing that can happen).
2. Call scaffold_component with the closest kind, then adapt it: an intent for every user-triggered message, one pure reducer per message, a view that only names intents.
3. Put side effects in commands (get_api "command", or @gyral/http / @gyral/time / @gyral/router).
4. Write model tests with step/run from @gyral/testing (no DOM).
5. Run check_snippet on every file and fix all errors before answering.

${skill}`,
          },
        },
      ],
    }),
  );
}

/** A configured server; connect it to a transport (stdio in cli.ts). */
export function createServer(corpus: Corpus, options: ToolOptions): McpServer {
  const server = new McpServer(
    { name: 'gyral', title: 'Gyral', version: corpus.version },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, corpus, options);
  registerResources(server, corpus);
  registerPrompts(server, corpus);
  return server;
}
