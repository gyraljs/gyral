// The Gyral MCP server: tools (tools.ts), the llms.txt and skill resources, and a prompt that
// walks an agent through building a component the Gyral way.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Steering } from './guidance.js';
import { registerTools, type ToolOptions } from './tools.js';
import type { Corpus } from './types.js';

/** The initialize instructions: the workflow first, then the model in one sentence. */
const instructions = (verify: string): string =>
  `Gyral workflow: 1. start_here once, or go straight to scaffold_component (basic, form-native, form, ssr-page) or get_example for working code. 2. Write the module right away. 3. ${verify} Call get_api only for a name you already saw in an example or an error: TypeScript infers Gyral's types from define(), so don't look them up one by one. Gyral components are Model-View-Intent custom elements with their own view layer (html, css, each from @gyral/core): intent parses DOM events into typed messages, update is one pure reducer per message, view names intents with data-intent (no event handlers), and side effects are commands. A component in its own module must be imported by the entry module (import './my-widget.js'), or its tag is never defined. The rules and decision tables: the gyral://skill resource.`;

function registerResources(server: McpServer, corpus: Corpus, steering: Steering): void {
  server.registerResource(
    'llms-txt',
    'gyral://llms.txt',
    {
      title: 'Gyral llms.txt',
      description:
        'Overview of Gyral and an index of its documentation (https://gyral.dev/llms.txt).',
      mimeType: 'text/plain',
    },
    (uri) => {
      steering.readResource();
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: corpus.llmsTxt }] };
    },
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
    (uri) => {
      steering.readResource();
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: skill?.content ?? '' }],
      };
    },
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
      steering.readResource();
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

function registerPrompts(server: McpServer, corpus: Corpus, verification: string): void {
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
2. Call scaffold_component with the closest kind (or get_example for the closest example), then adapt it: an intent for every user-triggered message, one pure reducer per message, a view that only names intents.
3. Put side effects in commands (get_api "command", or @gyral/http / @gyral/time / @gyral/router).
4. Write model tests with step/run from @gyral/testing (no DOM).
5. ${verification}

${skill}`,
          },
        },
      ],
    }),
  );
}

/** A configured server; connect it to a transport (stdio in cli.ts). */
export function createServer(corpus: Corpus, options: ToolOptions): McpServer {
  const verification =
    options.snippetChecks === false
      ? 'Run your project typecheck, model tests and browser tests; fix all errors before answering. This public server cannot inspect your installed packages. The local stdio server offers check_snippet.'
      : 'Run check_snippet on every file, apply its suggested fixes and check again until it passes before answering.';
  const server = new McpServer(
    { name: 'gyral', title: 'Gyral', version: corpus.version },
    { instructions: instructions(verification) },
  );
  // Counts reads since the last write, one per server instance: a stdio session, or a single
  // request on the stateless HTTP server (where nothing outlives the request, so it never nudges).
  const steering = new Steering();
  registerTools(server, corpus, options, steering);
  registerResources(server, corpus, steering);
  registerPrompts(server, corpus, verification);
  return server;
}
