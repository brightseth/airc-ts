#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { setTimeout as sleep } from 'node:timers/promises';

const WORKDIR = path.dirname(fileURLToPath(import.meta.url));
const MCP_ENTRY = path.resolve(WORKDIR, '../mcp-sdk-validation/node_modules/airc-mcp/index.js');
const A = 'airc-mcp';
const handle = `codex_mcp_${Date.now().toString(36).slice(-6)}`;
const registryHandle = handle;

async function run() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_ENTRY],
    env: { AIRC_REGISTRY: 'https://www.slashvibe.dev' },
  });

  const client = new Client({ name: 'compose-probe', version: '0.1.0' }, { capabilities: {} });
  await client.connect(transport);

  const tools = await client.listTools();

  const register = await client.callTool({
    name: 'airc_register',
    arguments: {
      handle: registryHandle,
      workingOn: 'Composability test sender',
    },
  });

  const who = await client.callTool({ name: 'airc_who', arguments: {} });

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

  await client.callTool({
    name: 'airc_consent',
    arguments: { handle: 'airc_ambassador', action: 'accept' },
  });

  await client.close();
  await sleep(100);

  const reportRows = [
    ['listTools', { command: 'client.listTools()' }, tools, typeof tools?.tools === 'object' ? 'ok' : 'fail'],
    ['register', { command: 'airc_register', args: { handle: registryHandle } }, register, register ? 'ok' : 'fail'],
    ['who', { command: 'airc_who' }, who, who ? 'ok' : 'fail'],
    ['send', { command: 'airc_send', args: { to: 'airc_ambassador' } }, send, send ? 'ok' : 'fail'],
    ['poll', { command: 'airc_poll' }, poll, poll ? 'ok' : 'fail'],
    ['heartbeat', { command: 'airc_heartbeat' }, heartbeat, heartbeat ? 'ok' : 'fail'],
  ];

  console.log('MCP_TOOLS', JSON.stringify(tools?.tools?.map((tool) => tool.name), null, 2));
  console.log('SEQUENCE_RESULT', JSON.stringify(reportRows, null, 2));
}

run().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
