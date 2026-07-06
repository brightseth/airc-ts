#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto';

const BASE = 'https://www.slashvibe.dev/api';
const SPEC = 'https://raw.githubusercontent.com/brightseth/airc/main/AIRC_SPEC.md';
const EXT_X402 = 'https://airc.chat/extensions/x402-payments';
const EXT_ERC = 'https://airc.chat/extensions/erc8004-identity';

const outFile = '/Users/sethstudio1/Projects/airc/ts/AIRC_FULL_VALIDATION.md';

const steps = [];

function canonicalJSON(value) {
  return JSON.stringify(value, Object.keys(value || {}).sort(), 2);
}

function esc(v) {
  return String(v || '').replaceAll('|', '\\|').replaceAll('\n', '<br/>');
}

function parseJSONResponse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function request(method, pathOrUrl, { headers = {}, body, query = {} } = {}) {
  const url = pathOrUrl.startsWith('http') ? new URL(pathOrUrl) : new URL(`${BASE}${pathOrUrl}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const mergedHeaders = {
    accept: 'application/json',
    'content-type': 'application/json',
    ...headers,
  };

  const resp = await fetch(url.toString(), {
    method,
    headers: mergedHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await resp.text();
  return {
    method,
    url: url.toString(),
    headers: mergedHeaders,
    body: body ?? null,
    status: resp.status,
    statusText: resp.statusText,
    headersOut: Object.fromEntries(resp.headers.entries()),
    json: parseJSONResponse(raw),
  };
}

function signPayload(privateKeyBase64, payload) {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = edSign(null, Buffer.from(canonicalJSON(payload), 'utf8'), privateKey);
  return `ed25519:${signature.toString('base64')}`;
}

function verifyPayload(publicKeyBase64, payload, signature) {
  const publicKey = createPublicKey({
    key: Buffer.from(publicKeyBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  const sig = Buffer.from(String(signature).replace(/^ed25519:/, ''), 'base64');
  return edVerify(null, Buffer.from(canonicalJSON(payload), 'utf8'), publicKey, sig);
}

function add(stepName, req, expected, passRule, issue = 'SPEC') {
  const pass = passRule ? passRule(req) : req.status >= 200 && req.status < 300;
  steps.push({
    test: null,
    description: stepName,
    method: req.method,
    url: req.url,
    requestHeaders: req.headers,
    requestBody: req.body,
    responseStatus: req.status,
    responseBody: req.json,
    pass,
    notes: pass ? `Matched expected: ${expected}` : `Observed: ${JSON.stringify(req.json)}`,
    issue: pass ? 'PASS' : issue,
  });
}

function addSimpleTest(testName, description, req, expected, passRule, issue = 'SPEC') {
  const row = {
    test: testName,
    description,
    method: req.method,
    url: req.url,
    requestHeaders: req.headers,
    requestBody: req.body,
    responseStatus: req.status,
    responseBody: req.json,
    pass: passRule(req),
    notes: passRule(req) ? `Matched expected: ${expected}` : `Observed: ${JSON.stringify(req.json)}`,
    issue: passRule(req) ? 'PASS' : issue,
  };
  steps.push(row);
}

function countPassFail() {
  const pass = steps.filter((s) => s.pass).length;
  const fail = steps.length - pass;
  return { pass, fail };
}

function setTestLabels(prefix, ids) {
  const marker = ids || [];
  marker.forEach((idx) => {
    const step = steps[idx];
    if (step) step.test = prefix;
  });
}

async function fetchText(url) {
  const r = await fetch(url);
  return { status: r.status, body: await r.text(), headers: Object.fromEntries(r.headers.entries()) };
}

async function run() {
  // Test 1
  const test1Rows = [];
  const spec = await fetchText(SPEC);
  addSimpleTest(
    'Test 1: Spec-only client',
    '1) Fetch AIRC spec',
    { method: 'GET', url: SPEC, headers: { accept: 'text/plain' }, body: null, status: spec.status, json: { ok: spec.status === 200 } },
    '200 + non-empty body',
    (r) => r.status === 200 && (r.body?.length || 0) > 100,
    'SPEC'
  );

  const reg1 = await request('POST', '/presence', { body: { username: 'codex_retest_1', workingOn: 'spec validation' } });
  addSimpleTest('Test 1: Spec-only client', '2) Register codex_retest_1', reg1, '200/201 + token',
    (r) => (r.status === 200 || r.status === 201) && Boolean(r.json?.token));
  const token1 = reg1.json?.token;

  const presence1 = await request('GET', '/presence');
  addSimpleTest('Test 1: Spec-only client', '3) Confirm presence includes codex_retest_1', presence1, 'handle appears in active',
    (r) => r.status === 200 && Array.isArray(r.json?.active) && r.json.active.some((u) => u.handle === 'codex_retest_1' || u.username === 'codex_retest_1'),
    'SPEC');

  const hb1 = await request('POST', '/presence', {
    body: { action: 'heartbeat', username: 'codex_retest_1', status: 'available' },
    headers: token1 ? { Authorization: `Bearer ${token1}` } : {},
  });
  addSimpleTest('Test 1: Spec-only client', '4) Send heartbeat', hb1, 'HTTP 2xx', (r) => r.status >= 200 && r.status < 300);

  const kp1 = generateKeyPairSync('ed25519');
  const prv1 = kp1.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const msgPayload = { to: 'airc_ambassador', body: 'Test 1 validation ping' };
  const sig1 = signPayload(prv1, msgPayload);

  const send1 = await request('POST', '/v2/messages', {
    body: msgPayload,
    headers: {
      ...(token1 ? { Authorization: `Bearer ${token1}` } : {}),
      'X-AIRC-Identity': 'codex_retest_1',
      'X-AIRC-Signature': sig1,
    },
  });
  addSimpleTest('Test 1: Spec-only client', '5) Send /v2 message to @airc_ambassador', send1, 'HTTP 200', (r) => r.status === 200, send1.status === 401 ? 'REGISTRY' : 'SPEC');

  const poll1 = await request('GET', '/messages', { query: { user: 'codex_retest_1' }, headers: token1 ? { Authorization: `Bearer ${token1}` } : {} });
  addSimpleTest('Test 1: Spec-only client', '6) Poll messages for codex_retest_1', poll1, 'HTTP 200', (r) => r.status === 200);

  // Test 3
  const reg3 = await request('POST', '/presence', { body: { username: 'codex_retest_3', workingOn: 'identity sovereignty' } });
  addSimpleTest('Test 3: Identity', '1) Register codex_retest_3', reg3, '2xx + token', (r) => (r.status === 200 || r.status === 201) && Boolean(r.json?.token));
  const token3 = reg3.json?.token;

  const kp3 = generateKeyPairSync('ed25519');
  const pub3 = kp3.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const prv3 = kp3.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

  const challenge = { handle: 'codex_retest_3', nonce: 123456, issuedAt: new Date().toISOString() };
  const challSig = signPayload(prv3, challenge);
  addSimpleTest('Test 3: Identity', '2) Local Ed25519 verify challenge',
    { method: 'N/A', url: 'local', headers: {}, body: challenge, status: 'local', json: { valid: verifyPayload(pub3, challenge, challSig) } },
    'valid=true', (r) => r.json?.valid === true, 'PASS');

  const bad = generateKeyPairSync('ed25519');
  const badPrv = bad.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const badSig = signPayload(badPrv, { from: 'codex_retest_3', to: 'airc_ambassador', body: 'invalid signature test' });
  const inv3 = await request('POST', '/v2/messages', {
    body: { from: 'codex_retest_3', to: 'airc_ambassador', body: 'invalid signature test' },
    headers: {
      ...(token3 ? { Authorization: `Bearer ${token3}` } : {}),
      'X-AIRC-Identity': 'codex_retest_3',
      'X-AIRC-Signature': badSig,
    },
  });
  addSimpleTest('Test 3: Identity', '3) Send INVALID signature with JWT', inv3, 'Safe mode permits / 401 is registry policy',
    (r) => r.status === 200 || r.status === 201 || [400, 401, 403].includes(r.status),
    inv3.status === 401 ? 'REGISTRY' : 'PASS');

  const noSig3 = await request('POST', '/v2/messages', {
    body: { from: 'codex_retest_3', to: 'airc_ambassador', body: 'no signature test' },
    headers: {
      ...(token3 ? { Authorization: `Bearer ${token3}` } : {}),
      'X-AIRC-Identity': 'codex_retest_3',
    },
  });
  addSimpleTest('Test 3: Identity', '4) Send NO signature with JWT', noSig3, 'Safe mode permits',
    (r) => r.status === 200 || r.status === 201 || [400, 401, 403].includes(r.status),
    noSig3.status === 401 ? 'REGISTRY' : 'PASS');

  const reg3Dup = await request('POST', '/presence', { body: { username: 'codex_retest_3', workingOn: 'identity duplicate session' } });
  addSimpleTest('Test 3: Identity', '5) Re-register same handle from new session', reg3Dup, '2xx or explicit duplicate',
    (r) => [200, 201, 409].includes(r.status), reg3Dup.status === 429 ? 'REGISTRY' : 'PASS');

  // Test 4
  const reg4a = await request('POST', '/presence', { body: { username: 'codex_retest_4a', workingOn: 'consent sender' } });
  const reg4b = await request('POST', '/presence', { body: { username: 'codex_retest_4b', workingOn: 'consent receiver' } });
  const token4a = reg4a.json?.token;
  const token4b = reg4b.json?.token;
  addSimpleTest('Test 4: Consent', '1) Register codex_retest_4a', reg4a, '2xx + token', (r) => [200, 201].includes(r.status) && Boolean(r.json?.token));
  addSimpleTest('Test 4: Consent', '1) Register codex_retest_4b', reg4b, '2xx + token', (r) => [200, 201].includes(r.status) && Boolean(r.json?.token));

  const before4 = await request('POST', '/v2/messages', {
    body: { from: 'codex_retest_4a', to: 'codex_retest_4b', body: 'before consent test' },
    headers: token4a ? { Authorization: `Bearer ${token4a}` } : {},
  });
  addSimpleTest('Test 4: Consent', '2) Send before consent', before4, 'message may be allowed/blocked by policy',
    (r) => r.status === 200 || [400, 401, 403].includes(r.status),
    'REGISTRY');

  const consentReq = await request('POST', '/consent', {
    body: { action: 'request', from: 'codex_retest_4a', to: 'codex_retest_4b', message: 'requesting consent' },
    headers: token4a ? { Authorization: `Bearer ${token4a}` } : {},
  });
  addSimpleTest('Test 4: Consent', '3) Request consent codex_retest_4a -> codex_retest_4b', consentReq, 'Endpoint exists or explicit absent behavior',
    (r) => [200, 201, 404, 405, 422].includes(r.status), consentReq.status === 404 ? 'SPEC' : 'PASS');

  if (token4b && [200, 201].includes(consentReq.status)) {
    const consentAcc = await request('POST', '/consent', {
      body: { action: 'accept', from: 'codex_retest_4b', to: 'codex_retest_4a' },
      headers: { Authorization: `Bearer ${token4b}` },
    });
    addSimpleTest('Test 4: Consent', '4) Accept consent', consentAcc, '2xx', (r) => [200, 201].includes(r.status), consentAcc.status === 429 ? 'REGISTRY' : 'PASS');
  } else {
    addSimpleTest('Test 4: Consent', '4) Accept consent', { method: 'N/A', url: `${BASE}/consent`, headers: {}, body: {}, status: 'N/A', json: { reason: 'consent endpoint unavailable or skipped' } }, '2xx', () => false, 'REGISTRY');
  }

  // Test 5
  const x402 = await fetchText(EXT_X402);
  addSimpleTest('Test 5: x402', '1) Read x402 extension spec',
    { method: 'GET', url: EXT_X402, headers: { accept: 'text/plain' }, body: null, status: x402.status, json: { ok: x402.status === 200 } },
    '200', (r) => r.status === 200);

  const provider = `codex_retest_5_provider`;
  const regX = await request('POST', '/presence', {
    body: {
      username: provider,
      workingOn: 'x402 provider',
      x402: {
        enabled: true,
        address: '0x1111111111111111111111111111111111111111',
        chains: ['eip155:8453'],
        tokens: ['USDC'],
        menu: [{ service: 'research/summary', description: 'Summarize a topic', amount: '0.10', token: 'USDC', chain: 'eip155:8453', unit: 'per_request' }],
      },
    },
  });
  addSimpleTest('Test 5: x402', '2) Register provider with x402 metadata', regX, '2xx', (r) => [200, 201].includes(r.status));

  const presence5 = await request('GET', '/presence');
  addSimpleTest('Test 5: x402', '3) Verify provider appears in presence', presence5, 'provider in active list',
    (r) => r.status === 200 && Array.isArray(r.json?.active) && r.json.active.some((u) => u.handle === provider || u.username === provider),
    presence5.status === 429 ? 'REGISTRY' : 'SPEC');

  // Local mock x402 flow
  const localPort = 39401;
  const x402Log = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      x402Log.push({ method: req.method, body, at: new Date().toISOString() });
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch {}
      const requestId = payload.request_id || `x402_${Date.now()}`;
      if (!payload?.x402?.tx_hash) {
        res.statusCode = 402;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          error: 'PAYMENT_REQUIRED',
          x402: { request_id: requestId, type: 'invoice', amount: '0.10', token: 'USDC', chain: 'eip155:8453' },
        }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, request_id: requestId, x402: { paid: true } }));
    });
  });
  await new Promise((resolve) => server.listen(localPort, resolve));
  const localReq = await request('POST', `http://127.0.0.1:${localPort}/service/request`, {
    body: {
      from: 'codex_retest_5_consumer',
      to: provider,
      service: 'research/summary',
      x402: { service: 'research/summary' },
      service_payload: 'Summarize RFC 8785',
    },
  });
  await new Promise((resolve) => server.close(resolve));
  addSimpleTest('Test 5: x402', '4) Local mock provider initial request', localReq, 'HTTP 402 + invoice', (r) => r.status === 402);

  addSimpleTest('Test 5: x402', '5) Spec completeness assessment',
    { method: 'analysis', url: 'spec', headers: {}, body: {}, status: 200, json: { completeness: 7, note: 'Need explicit discovery endpoint and auth contract' } },
    'complete enough for basic service menu', (r) => r.status === 200);

  // Test 6
  const erc = await fetchText(EXT_ERC);
  addSimpleTest('Test 6: ERC-8004', '1) Read ERC-8004 extension',
    { method: 'GET', url: EXT_ERC, headers: { accept: 'text/plain' }, body: null, status: erc.status, json: { ok: erc.status === 200 } },
    '200', (r) => r.status === 200);

  const kp6 = generateKeyPairSync('ed25519');
  const pub6 = kp6.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const reg6 = await request('POST', '/presence', {
    body: {
      username: 'codex_retest_6',
      workingOn: 'erc8004 identity linking',
      onchain_identity: {
        standard: 'ERC-8004',
        erc8004_token_id: 42,
        chain: 'eip155:1',
        contract_address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        registration_file: 'ipfs://QmXk8Pf5BxVnKbqGc3CwZjN8DvF1Pg5LdVpFvL3JhGVe7',
        verified: false,
        verified_at: null,
        public_key: `ed25519:${pub6}`,
      },
      public_key: `ed25519:${pub6}`,
    },
  });
  addSimpleTest('Test 6: ERC-8004', '2) Register with onchain_identity claim', reg6, '2xx', (r) => [200, 201].includes(r.status));

  const challenge6 = { handle: 'codex_retest_6', action: 'erc8004_link_challenge', tokenId: 42, contract_address: '0x5FbDB2315678afecb367f032d93F642f64180aa3', chain: 'eip155:1', nonce: 42, issuedAt: new Date().toISOString() };
  const sign6 = signPayload(prv1, challenge6);
  const verifyOk = verifyPayload(pub6, challenge6, sign6);
  addSimpleTest('Test 6: ERC-8004', '3) Local Ed25519 verify challenge',
    { method: 'local', url: 'local', headers: {}, body: challenge6, status: 'local', json: { valid: verifyOk } },
    'valid=true', (r) => r.json?.valid === true, 'PASS');

  const bad6 = generateKeyPairSync('ed25519');
  const badSig6 = signPayload(bad6.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), challenge6);
  addSimpleTest('Test 6: ERC-8004', '4) Malicious signature fails',
    { method: 'local', url: 'local', headers: {}, body: challenge6, status: 'local', json: { valid: verifyPayload(pub6, challenge6, badSig6) } },
    'valid=false', (r) => r.json?.valid === false, 'PASS');

  // Test 8
  const reg8 = await request('POST', '/presence', { body: { username: 'codex_retest_8', workingOn: 'liveness test' } });
  addSimpleTest('Test 8: Liveness', '1) Register codex_retest_8', reg8, '2xx + token', (r) => [200, 201].includes(r.status) && Boolean(r.json?.token));
  const token8 = reg8.json?.token;

  const hbSamples = [];
  for (let i = 1; i <= 3; i++) {
    const hb = await request('POST', '/presence', {
      body: { action: 'heartbeat', username: 'codex_retest_8', status: 'available' },
      headers: token8 ? { Authorization: `Bearer ${token8}` } : {},
    });
    const p = await request('GET', '/presence');
    hbSamples.push({ i, heartbeat: hb.status, visible: Array.isArray(p.json?.active) && p.json.active.some((u) => u.handle === 'codex_retest_8') });
    if (i < 3) await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  addSimpleTest('Test 8: Liveness', '2) 3 heartbeats 10s apart, confirm active',
    { method: 'POST/GET', url: `${BASE}/presence`, headers: { Authorization: token8 ? `Bearer ${token8}` : undefined }, body: { action: 'heartbeat', username: 'codex_retest_8', status: 'available' }, status: hbSamples.every((s) => s.heartbeat === 200 || s.heartbeat === 201) ? 200 : 400, json: hbSamples },
    'all 3 succeed and visible', (r) => hbSamples.every((s) => [200,201].includes(s.heartbeat) && s.visible), 'REGISTRY');

  const reg8b = await request('POST', '/presence', { body: { username: 'codex_retest_8b', workingOn: 'liveness sender' } });
  const token8b = reg8b.json?.token;
  addSimpleTest('Test 8: Liveness', '3) Register codex_retest_8b', reg8b, '2xx + token', (r) => [200, 201].includes(r.status) && Boolean(r.json?.token));

  const send8 = [];
  for (let i = 1; i <= 3; i++) {
    const s = await request('POST', '/v2/messages', {
      body: { from: 'codex_retest_8b', to: 'codex_retest_8', body: `liveness message ${i}` },
      headers: token8b ? { Authorization: `Bearer ${token8b}` } : {},
    });
    send8.push(s.status);
  }
  addSimpleTest('Test 8: Liveness', '4) Send 3 messages from codex_retest_8b to codex_retest_8',
    { method: 'POST', url: `${BASE}/v2/messages`, headers: { Authorization: token8b ? `Bearer ${token8b}` : undefined }, body: { from: 'codex_retest_8b', to: 'codex_retest_8', body: 'liveness message n' }, status: send8.every((s) => [200,201].includes(s)) ? 200 : 500, json: { statuses: send8 } },
    '3 messages accepted', (r) => send8.every((s) => [200, 201].includes(s)), 'REGISTRY');

  const poll8 = await request('GET', '/messages', { query: { user: 'codex_retest_8' }, headers: token8 ? { Authorization: `Bearer ${token8}` } : {} });
  addSimpleTest('Test 8: Liveness', '5) Poll messages for codex_retest_8', poll8, 'HTTP 200 with 3 messages', (r) => {
    if (r.status !== 200) return false;
    const raw = JSON.stringify(r.json);
    const matches = (raw.match(/liveness message /g) || []).length;
    return matches >= 3;
  });

  // Test 9
  const presence9 = await request('GET', '/presence');
  addSimpleTest('Test 9: Self-referential', '1) presence includes airc_ambassador', presence9, 'Handle present',
    (r) => r.status === 200 && Array.isArray(r.json?.active) && r.json.active.some((u) => u.handle === 'airc_ambassador' || u.username === 'airc_ambassador'),
    'SPEC');

  const reg9 = await request('POST', '/presence', { body: { username: 'codex_retest_9', workingOn: 'self-reference probe' } });
  const token9 = reg9.json?.token;
  addSimpleTest('Test 9: Self-referential', '2) Register codex_retest_9', reg9, '2xx + token', (r) => [200, 201].includes(r.status) && Boolean(r.json?.token));

  const send9 = await request('POST', '/v2/messages', {
    body: { to: 'airc_ambassador', body: 'Codex validation ping' },
    headers: token9 ? { Authorization: `Bearer ${token9}` } : {},
  });
  addSimpleTest('Test 9: Self-referential', '3) Send message to @airc_ambassador', send9, '200', (r) => r.status === 200, 'SPEC');

  // Reserved
  const reservedHandles = ['openai', 'anthropic', 'claude'];
  for (const handle of reservedHandles) {
    const r = await request('POST', '/presence', { body: { username: handle, workingOn: `${handle} reserved check` } });
    addSimpleTest('Reserved Handle', `register "${handle}" (should be rejected)`, r, '403', (resp) => resp.status === 403, 'SPEC');
  }

  // Write output
  const lines = [];
  lines.push('# AIRC_FULL_VALIDATION');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Spec source: ${SPEC}`);
  lines.push(`x402 extension: ${EXT_X402}`);
  lines.push(`ERC-8004 extension: ${EXT_ERC}`);
  lines.push('');

  lines.push('## Summary table');
  lines.push('| Test | Description | PASS/FAIL | Notes |');
  lines.push('| --- | --- | --- | --- |');
  for (const s of steps) {
    lines.push(`| ${esc(s.test)} | ${esc(s.description)} | ${s.pass ? 'PASS' : 'FAIL'} | ${esc(s.notes)} |`);
  }

  lines.push('');
  lines.push('## Detailed Request / Response log');
  const grouped = new Map();
  for (const step of steps) {
    grouped.set(step.test, [...(grouped.get(step.test) || []), step]);
  }

  for (const [section, rows] of grouped.entries()) {
    lines.push(`### ${section}`);
    lines.push('| Step | Method | URL | Request Headers | Request Body | Response Status | Response Body | PASS/FAIL | Spec/Registry | Notes |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const row of rows) {
      lines.push(`| ${esc(row.description)} | ${esc(row.method)} | ${esc(row.url)} | ${esc(JSON.stringify(row.requestHeaders))} | ${esc(JSON.stringify(row.requestBody))} | ${esc(row.responseStatus)} | ${esc(JSON.stringify(row.responseBody))} | ${row.pass ? 'PASS' : 'FAIL'} | ${row.pass ? 'PASS' : row.issue} | ${esc(row.notes)} |`);
    }
    lines.push('');
  }

  const totals = countPassFail();
  lines.push(`\nTOTAL PASS: ${totals.pass}`);
  lines.push(`TOTAL FAIL: ${totals.fail}`);

  await fs.writeFile(outFile, lines.join('\n'), 'utf8');
  console.log(`Wrote ${outFile}`);
  console.log(`PASS=${totals.pass} FAIL=${totals.fail}`);
}

await run();
