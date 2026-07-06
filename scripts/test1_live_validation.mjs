#!/usr/bin/env node
import { createPrivateKey, generateKeyPairSync, sign as edSign, verify as edVerify, createPublicKey } from 'node:crypto';
import fs from 'node:fs/promises';

const API = 'https://www.slashvibe.dev/api';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function canonicalJSON(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
}

function short(value) {
  return String(value).replace(/\"/g, '"').replace(/\n/g, '\\n').slice(0, 500);
}

async function request(method, path, { body = null, headers = {}, query = {}, retry = true } = {}) {
  const url = new URL(`${API}${path}`);
  Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  const req = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) req.body = JSON.stringify(body);

  for (let i = 0; i < (retry ? 3 : 1); i += 1) {
    const response = await fetch(url, req);
    const raw = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }

    if (response.status !== 429) {
      return { method, url: url.toString(), requestHeaders: req.headers, requestBody: body, status: response.status, responseHeaders: Object.fromEntries(response.headers.entries()), responseBody: parsed, raw, rawText: short(raw) };
    }

    const delay = Math.min(1000 * 2 ** i, 6000);
    await sleep(delay);
  }

  throw new Error('rate limited');
}

function sign(privateKeyBase64, payload) {
  const canonical = canonicalJSON(payload);
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const sig = edSign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
  return `ed25519:${sig}`;
}

function buildReport(rows) {
  const pass = rows.filter((r) => r.pass).length;
  const fail = rows.length - pass;
  const lines = [];
  lines.push('# AIRC Validation Report');
  lines.push(`Generated ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Test 1 — live registry smoke');
  lines.push('| Step | Request | Response | PASS/FAIL | Gap type | Details |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const row of rows) {
    const req = `${row.method} ${row.url}`;
    const r = row.response ? `${row.status} ${JSON.stringify(row.response).slice(0, 300)}` : `${row.status}`;
    lines.push(`| ${row.step} | ${req}<br/>${JSON.stringify(row.requestMeta)} | ${r} | ${row.pass ? 'PASS' : 'FAIL'} | ${row.gap} | ${row.details} |`);
  }

  lines.push('');
  lines.push(`Total steps: ${rows.length} | PASS: ${pass} | FAIL: ${fail}`);
  lines.push('');
  lines.push('## Test 1 required reserve/invalid handle checks');
  lines.push('| Handle | Request | Response | PASS/FAIL | Gap type | Details |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const row of rows.slice(-2)) {
    lines.push(`| ${row.step} | ${row.method} ${row.url} | ${row.status} ${JSON.stringify(row.response).slice(0, 220)} | ${row.pass ? 'PASS' : 'FAIL'} | ${row.gap} | ${row.details} |`);
  }

  return lines.join('\n');
}

async function register(handle, workingOn, includeAction = true) {
  const body = includeAction ? { action: 'register', username: handle, workingOn } : { username: handle, workingOn };
  const reg = await request('POST', '/presence', { body });
  const token = reg.responseBody?.token;
  return { reg, token };
}

(async () => {
  const results = [];

  const key = generateKeyPairSync('ed25519');
  const privateKey = key.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const publicKey = key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

  const handle = 'codex_test_agent';
  const reg = await register(handle, 'validation test agent');
  const regPass = [200, 201].includes(reg.reg.status) && !!reg.token;
  results.push({
    step: 'register',
    method: reg.reg.method,
    url: reg.reg.url,
    requestMeta: reg.reg.requestBody,
    status: reg.reg.status,
    response: reg.reg.responseBody,
    pass: regPass,
    gap: regPass ? 'PASS' : 'REGISTRY',
    details: regPass ? 'handle registered and token returned' : 'token missing or registration failed',
  });

  const presence = await request('GET', '/presence');
  const present = typeof presence.responseBody === 'object' && ((presence.responseBody.active || []).some((u) => u.username === handle) || (presence.responseBody.users || []).some((u) => u.handle === handle));
  results.push({
    step: 'register confirm',
    method: presence.method,
    url: presence.url,
    requestMeta: 'GET /api/presence',
    status: presence.status,
    response: presence.responseBody,
    pass: presence.status === 200 && present,
    gap: presence.status === 200 && present ? 'PASS' : 'REGISTRY',
    details: present ? 'handle visible in presence output' : 'handle not found in presence list',
  });

  const hb = await request('POST', '/presence', {
    body: {
      action: 'heartbeat',
      username: handle,
      status: 'available',
    },
    headers: reg.token ? { Authorization: `Bearer ${reg.token}` } : {},
  });
  results.push({
    step: 'heartbeat',
    method: hb.method,
    url: hb.url,
    requestMeta: hb.requestBody,
    status: hb.status,
    response: hb.responseBody,
    pass: hb.status >= 200 && hb.status < 300,
    gap: hb.status >= 200 && hb.status < 300 ? 'PASS' : 'REGISTRY',
    details: 'heartbeat call completed',
  });

  const payload = {
    to: 'airc_ambassador',
    body: 'hello from codex_test_agent',
    from: handle,
  };

  const sig = sign(privateKey, payload);
  const sendV2 = await request('POST', '/v2/messages', {
    body: {
      to: payload.to,
      body: payload.body,
    },
    headers: {
      ...(reg.token ? { Authorization: `Bearer ${reg.token}` } : {}),
      'X-AIRC-Signature': sig,
      'X-AIRC-Identity': handle,
    },
  });
  results.push({
    step: 'send signed message to @airc_ambassador',
    method: sendV2.method,
    url: sendV2.url,
    requestMeta: sendV2.requestBody,
    status: sendV2.status,
    response: sendV2.responseBody,
    pass: sendV2.status === 200,
    gap: sendV2.status === 200 ? 'PASS' : 'SPEC',
    details: sendV2.status === 405 || sendV2.status === 404 ? 'v2 endpoint exists but not required by registry implementation' : 'delivered via v2',
  });

  if (sendV2.status === 200) {
    const poll = await request('GET', '/messages', {
      query: { to: handle, since: Math.floor(Date.now() / 1000) - 120 },
      headers: reg.token ? { Authorization: `Bearer ${reg.token}` } : {},
    });
    const received = (poll.responseBody?.threads || []).some((t) => t.message_count > 0);
    results.push({
      step: 'poll messages',
      method: poll.method,
      url: poll.url,
      requestMeta: poll.requestBody,
      status: poll.status,
      response: poll.responseBody,
      pass: poll.status === 200,
      gap: poll.status === 200 ? 'PASS' : 'REGISTRY',
      details: received ? 'threads present' : 'no threads in poll response',
    });

    const pollV2 = await request('GET', '/v2/messages', {
      query: { to: handle, since: Math.floor(Date.now() / 1000) - 120 },
      headers: reg.token ? { Authorization: `Bearer ${reg.token}` } : {},
    });
    results.push({
      step: 'poll /api/v2/messages',
      method: pollV2.method,
      url: pollV2.url,
      requestMeta: pollV2.requestBody,
      status: pollV2.status,
      response: pollV2.responseBody,
      pass: pollV2.status === 200,
      gap: pollV2.status === 200 ? 'PASS' : 'REGISTRY',
      details: 'registry-specific behavior',
    });
  }

  const reserved = await register('openai', 'reserved handle check');
  results.push({
    step: 'register reserved handle "openai"',
    method: reserved.reg.method,
    url: reserved.reg.url,
    requestMeta: reserved.reg.requestBody,
    status: reserved.reg.status,
    response: reserved.reg.responseBody,
    pass: !(reserved.reg.status >= 200 && reserved.reg.status < 300),
    gap: [409, 400, 422].includes(reserved.reg.status) ? 'PASS' : 'REGISTRY',
    details: 'registry may allow reserved handle creation',
  });

  const invalid = await register('ab', 'short handle', true);
  results.push({
    step: 'register invalid format "ab"',
    method: invalid.reg.method,
    url: invalid.reg.url,
    requestMeta: invalid.reg.requestBody,
    status: invalid.reg.status,
    response: invalid.reg.responseBody,
    pass: invalid.reg.status >= 400,
    gap: invalid.reg.status >= 400 ? 'PASS' : 'REGISTRY',
    details: invalid.reg.status >= 400 ? 'short handle rejected' : 'registry accepted invalid-length handle',
  });

  const report = buildReport(results);
  await fs.writeFile('/Users/sethstudio1/Projects/airc/ts/VALIDATION_REPORT.md', report);
  console.log(report);
})();
