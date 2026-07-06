#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, generateKeyPairSync, sign as edSign } from 'node:crypto';

const REGISTRY = 'https://www.slashvibe.dev';
const HANDLE = 'codex_test_agent';
const TARGET = '@airc_ambassador';
const IMPLEMENTATION_MINUTES = process.env.IMPLEMENTATION_MINUTES;

async function httpJson(method, path, { body, headers = {} } = {}) {
  const response = await fetch(`${REGISTRY}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  const payload = parseJson(raw);
  return { response, payload };
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function canonicalJSON(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJSON(item)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys
      .map((key) => {
        if (value[key] === undefined) return null;
        return `${JSON.stringify(key)}:${canonicalJSON(value[key])}`;
      })
      .filter((entry) => entry !== null);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value);
}

function makeSignature(body, privateKeyBase64) {
  const canonical = canonicalJSON(body);
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = edSign(null, Buffer.from(canonical, 'utf8'), privateKey);
  return `ed25519:${signature.toString('base64')}`;
}

function normalizePresencePayload(payload) {
  if (!payload || typeof payload !== 'object') return [];

  if (Array.isArray(payload.users)) {
    return payload.users
      .map((item) => item?.handle || item?.username)
      .filter(Boolean);
  }

  const buckets = ['active', 'away', 'recent', 'offline', 'users'];
  const handles = new Set();
  for (const bucket of buckets) {
    if (!Array.isArray(payload[bucket])) continue;
    for (const user of payload[bucket]) {
      const item = user?.handle || user?.username;
      if (item) handles.add(item);
    }
  }
  return Array.from(handles);
}

function resultLine(step, ok, details) {
  return `| ${step} | ${ok ? 'PASS' : 'FAIL'} | ${String(details).replaceAll('|', '\\|')} |`;
}

function linesOfCode(paths) {
  return paths
    .map((file) => readFileSync(file, 'utf8').split(/\r?\n/).length)
    .reduce((acc, count) => acc + count, 0);
}

async function run() {
  const started = Date.now();
  const keypair = generateKeyPairSync('ed25519');
  const publicKey = keypair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const privateKey = keypair.privateKey
    .export({ type: 'pkcs8', format: 'der' })
    .toString('base64');

  const rows = [];
  let token;

  rows.push(resultLine('Ed25519 keypair generation', true, `public=${publicKey.slice(0, 24)}...`));

  const registerBody = {
    action: 'register',
    username: HANDLE,
    status: 'available',
    workingOn: 'AIRC validation run',
  };

  try {
    const { response, payload } = await httpJson('POST', '/api/presence', { body: registerBody });
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    rows.push(resultLine('POST /api/presence register', true, `HTTP ${response.status}; token present: ${Boolean(payload?.token)}`));
    token = payload?.token;
  } catch (error) {
    rows.push(resultLine('POST /api/presence register', false, String(error.message || error)));
  }

  try {
    const { response, payload } = await httpJson('GET', '/api/presence');
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    const handles = normalizePresencePayload(payload);
    const confirmed = handles.includes(HANDLE);
    rows.push(resultLine('GET /api/presence confirms handle', confirmed, `HTTP ${response.status}; users found: ${handles.length}`));
  } catch (error) {
    rows.push(resultLine('GET /api/presence confirms handle', false, String(error.message || error)));
  }

  try {
    const { response, payload } = await httpJson('POST', '/api/presence', {
      body: {
        action: 'heartbeat',
        username: HANDLE,
        status: 'available',
      },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    rows.push(resultLine('POST /api/presence heartbeat', true, `HTTP ${response.status}`));
  } catch (error) {
    rows.push(resultLine('POST /api/presence heartbeat', false, String(error.message || error)));
  }

  try {
    const messageBody = {
      from: HANDLE,
      to: TARGET.replace(/^@/, ''),
      text: 'Hello from minimal TypeScript AIRC client',
      type: 'text',
    };
    const signature = makeSignature(messageBody, privateKey);
    const { response, payload } = await httpJson('POST', '/api/messages', {
      body: messageBody,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-AIRC-Signature': signature,
        'X-AIRC-Identity': HANDLE,
      },
    });
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    rows.push(resultLine('POST /api/messages signed send', true, `HTTP ${response.status}; messageId:${payload?.messageId || 'n/a'}`));
  } catch (error) {
    rows.push(resultLine('POST /api/messages signed send', false, String(error.message || error)));
  }

  try {
    const params = new URLSearchParams({
      user: HANDLE,
      since: String(Math.floor(Date.now() / 1000 - 120)),
    });
    const { response, payload } = await httpJson('GET', `/api/messages?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    const count = Array.isArray(payload?.messages) ? payload.messages.length : 0;
    rows.push(resultLine('GET /api/messages poll', true, `HTTP ${response.status}; messages:${count}`));
  } catch (error) {
    rows.push(resultLine('GET /api/messages poll', false, String(error.message || error)));
  }

  const ambiguities = [
    '/api/presence register on slashvibe returns 403 unless GitHub-authenticated, even though the provided spec text treats it as open.',
    'GET /api/presence returns grouped buckets (`active`, `away`, `recent`) instead of a single users array.',
    '/api/messages and /api/presence endpoints currently require Bearer auth for register/heartbeat/message/poll in this environment.',
    'The spec mentions optional message signing and also states RFC 8785 canonicalization; the safest interop we can do is signing canonical JSON of the same request body.',
  ];

  const loc = linesOfCode(['src/minimal-airc-client.ts', 'scripts/validate-airc-live-registry.mjs']);
  const durationMs = Date.now() - started;

  const markdown = [
    '# AIRC Validation Report',
    `Generated: ${new Date().toISOString()}`,
    `Report purpose: live registry smoke test for handle ${HANDLE}`,
    '',
    '## Step Results',
    '| Step | Status | Details |',
    '| --- | --- | --- |',
    ...rows,
    '',
    '## Implementation Metrics',
    `- Total lines of code: ${loc}`,
    `- Validation run time: ${(durationMs / 1000).toFixed(3)}s`,
    `- Time to implement: ${IMPLEMENTATION_MINUTES ? `${IMPLEMENTATION_MINUTES} minutes` : 'not provided automatically; add via IMPLEMENTATION_MINUTES env var'}`,
    '',
    '## Spec Ambiguities Encountered',
    ...ambiguities.map((line) => `- ${line}`),
  ].join('\n');

  writeFileSync('VALIDATION_REPORT.md', markdown);
  console.log(markdown);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
