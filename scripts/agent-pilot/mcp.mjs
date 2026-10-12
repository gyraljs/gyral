import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IMAGE, sandbox } from './sandbox.mjs';

// Function names the bridge adds for MCP prompts and resources. The model calls tools only,
// so prompts and resources are reachable through these two (protocol v3, H5).
export const PROMPT_TOOL = 'get_prompt';
export const RESOURCE_TOOL = 'read_resource';
const TEXT_LIMIT = 16000;

const text = (value) => (value.length > TEXT_LIMIT ? `${value.slice(0, TEXT_LIMIT)}\n…` : value);

/**
 * Everything a connected MCP client offers the model: server instructions (for the system
 * prompt), tools, prompts (`mcp_get_prompt`) and resources (`mcp_read_resource`).
 */
export async function bridge(client, close = () => client.close()) {
  const instructions = client.getInstructions?.() ?? '';
  const capabilities = client.getServerCapabilities?.() ?? {};
  const { tools } = await client.listTools();
  const prompts = capabilities.prompts ? (await client.listPrompts()).prompts : [];
  const resources = capabilities.resources ? (await client.listResources()).resources : [];
  const templates = capabilities.resources
    ? (await client.listResourceTemplates()).resourceTemplates
    : [];
  for (const name of [PROMPT_TOOL, RESOURCE_TOOL])
    if (tools.some((entry) => entry.name === name))
      throw new Error(`MCP server tool ${name} collides with a bridge function`);
  const definitions = tools.map((entry) => ({
    type: 'function',
    function: {
      name: `mcp_${entry.name}`,
      description: entry.description,
      parameters: entry.inputSchema,
    },
  }));
  if (prompts.length)
    definitions.push({
      type: 'function',
      function: {
        name: `mcp_${PROMPT_TOOL}`,
        description: `Get a prompt from the MCP server. Available prompts:\n${prompts
          .map(
            (prompt) =>
              `- ${prompt.name}: ${prompt.description ?? prompt.title ?? ''}${
                prompt.arguments?.length
                  ? ` Arguments: ${prompt.arguments
                      .map(
                        (argument) =>
                          `${argument.name}${argument.required ? '' : '?'} (${argument.description ?? ''})`,
                      )
                      .join(', ')}.`
                  : ''
              }`,
          )
          .join('\n')}`,
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', enum: prompts.map((prompt) => prompt.name) },
            arguments: { type: 'object', additionalProperties: { type: 'string' } },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    });
  if (resources.length || templates.length)
    definitions.push({
      type: 'function',
      function: {
        name: `mcp_${RESOURCE_TOOL}`,
        description: `Read a resource from the MCP server by URI. Resources:\n${[
          ...resources.map(
            (resource) =>
              `- ${resource.uri}: ${resource.description ?? resource.title ?? resource.name}`,
          ),
          ...templates.map(
            (template) =>
              `- ${template.uriTemplate} (template): ${template.description ?? template.title ?? template.name}`,
          ),
        ].join('\n')}`,
        parameters: {
          type: 'object',
          properties: { uri: { type: 'string' } },
          required: ['uri'],
          additionalProperties: false,
        },
      },
    });
  const options = (remainingMs) => ({ timeout: Math.max(1, Math.min(60000, remainingMs)) });
  return {
    instructions,
    prompts: prompts.map((prompt) => prompt.name),
    resources: [
      ...resources.map((resource) => resource.uri),
      ...templates.map((template) => template.uriTemplate),
    ],
    definitions,
    async call(name, args, remainingMs = 60000) {
      if (name === PROMPT_TOOL) {
        const result = await client.getPrompt(
          { name: args?.name, arguments: args?.arguments ?? {} },
          options(remainingMs),
        );
        return {
          description: result.description,
          messages: result.messages.map((message) => ({
            role: message.role,
            text: text(message.content?.type === 'text' ? message.content.text : ''),
          })),
        };
      }
      if (name === RESOURCE_TOOL) {
        const result = await client.readResource({ uri: args?.uri }, options(remainingMs));
        return {
          contents: result.contents.map((content) => ({
            uri: content.uri,
            mimeType: content.mimeType,
            text: text(content.text ?? '(binary content omitted)'),
          })),
        };
      }
      return client.callTool({ name, arguments: args }, undefined, options(remainingMs));
    },
    close,
  };
}

export async function connectMcp(corpus, workspace, generated) {
  const require = createRequire(join(resolve(corpus), 'mcp/package.json'));
  const { Client } = await import(
    pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href
  );
  const { StdioClientTransport } = await import(
    pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href
  );
  const client = new Client({ name: 'gyral-agent-pilot', version: '3.0.0' });
  const transport = new StdioClientTransport({
    command: 'docker',
    args: [
      ...sandbox(corpus, workspace, 'gyral', generated),
      '--interactive',
      '--mount',
      `type=bind,src=${join(resolve(corpus), 'mcp')},dst=/mcp,readonly`,
      '--env',
      'GYRAL_PROJECT_DIR=/app',
      IMAGE,
      'node',
      '/mcp/node_modules/@gyral/mcp/dist/cli.js',
    ],
    env: { PATH: process.env.PATH },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', () => {});
  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close();
    throw error;
  }
  try {
    return await bridge(client);
  } catch (error) {
    await client.close();
    throw error;
  }
}
