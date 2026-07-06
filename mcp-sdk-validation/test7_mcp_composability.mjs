#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MCP_ENTRY = path.resolve(ROOT, 'node_modules/airc-mcp/index.js');
const handle = `codex_mcp_${Date.now().toString(36).slice(-6)}`;

async function run() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_ENTRY],
    env: { AIRC_REGISTRY: 'https://www.slashvibe.dev' },
  });

  const client = new Client({ name: 'compose-probe', version: '0.1.0' }, { capabilities: {} });
  await client.connect(transport);

  const toolList = await client.listTools();

  const register = await client.callTool({
    name: 'airc_register',
    arguments: {
      handle,
      workingOn: 'Composability test sender',
    },
  });

  const who = await client.callTool({
    name: 'airc_who',
    arguments: {},
  });

  const send = await client.callTool({
    name: 'airc_send',
    arguments: {
      to: 'airc_ambassador',
      text: 'Codex Test7 MCP probe message',
    },
  });

  const poll = await client.callTool({
    name: 'airc_poll',
    arguments: {},
  });

  const heartbeat = await client.callTool({
    name: 'airc_heartbeat',
    arguments: {},
  });

  const consent = await client.callTool({
    name: 'airc_consent',
    arguments: { handle: 'airc_ambassador', action: 'accept' },
  });

  await client.close();

  const output = {
    mcpTools: (toolList.tools || []).map((tool) => tool.name),
    sequence: {
      register,
      who,
      send,
      poll,
      heartbeat,
      consent,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

run().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
