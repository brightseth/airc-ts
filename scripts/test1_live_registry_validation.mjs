#!/usr/bin/env node
import { createPrivateKey, generateKeyPairSync, sign as edSign } from 'node:crypto';

const API = 'https://www.slashvibe.dev/api';
const HANDLE = 'codex_test_agent';

function canonicalJSON(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJSON(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => (value[key] === undefined ? null : `${JSON.stringify(key)}:${canonicalJSON(value[key])}`))
    .filter((entry) => entry !== null)
    .join(',')}}`;
}

function hasHandle(activePayload, handle) {
  const buckets = ['active', 'away', 'recent', 'offline', 'users', 'sessions'];
  for (const b of buckets) {
    const arr = activePayload?.[b];
    if (!Array.isArray(arr)) continue;
    if (arr.some((entry) => entry?.handle === handle || entry?.username === handle)) {
      return true;
    }
  }
  return false;
}

async function req(method, path, headers = {}, body) {
  const url = `${API}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { raw };
  }

  return { method, url, status: response.status, headers: Object.fromEntries(response.headers.entries()), requestBody: body || null, responseBody: parsed };
}

function sign(privateKeyB64, payload) {
  const key = createPrivateKey({ key: Buffer.from(privateKeyB64, 'base64'), format: 'der', type: 'pkcs8' });
  const signature = edSign(null, Buffer.from(canonicalJSON(payload), 'utf8'), key);
  return `ed25519:${signature.toString('base64')}`;
}

(async () => {
  const kp = generateKeyPairSync('ed25519');
  const priv = kp.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const pub = kp.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

  const rows = [];
  console.log(`1) Ed25519 keypair: pub(ed25519:${pub.slice(0, 24)}...), priv(ed25519:${priv.slice(0, 12)}...)`);

  const registerReq = await req('POST', '/presence', {
    action: undefined,
    username: HANDLE,
    workingOn: 'validation handle for open registration',
  });
  rows.push({ label: 'Register codex_test_agent', request: registerReq, outcome: `HTTP ${registerReq.status}` });
  const token = registerReq.responseBody?.token;

  const heartbeatReq = await req('POST', '/presence', token ? { Authorization: `Bearer ${token}` } : {}, {
    action: 'heartbeat',
    username: HANDLE,
    status: 'available',
  });
  rows.push({ label: 'Heartbeat', request: heartbeatReq, outcome: `HTTP ${heartbeatReq.status}` });

  const presenceReq = await req('GET', '/presence', {});
  const inPresence = hasHandle(presenceReq.responseBody, HANDLE);
  rows.push({ label: 'Confirm /api/presence includes handle', request: presenceReq, outcome: inPresence ? 'found' : 'missing' });

  const messagePayload = { to: 'airc_ambassador', body: 'Codex validation ping', type: 'text' };
  const signature = sign(priv, messagePayload);
  const messageReq = await req('POST', '/v2/messages', {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-AIRC-Identity': HANDLE,
    'X-AIRC-Signature': signature,
  }, {
    from: HANDLE,
    ...messagePayload,
  });
  rows.push({ label: 'Send signed message', request: messageReq, outcome: `HTTP ${messageReq.status}` });

  const pollReq = await req('GET', `/messages?user=${HANDLE}`, token ? { Authorization: `Bearer ${token}` } : {});
  rows.push({ label: 'Poll incoming messages', request: pollReq, outcome: `HTTP ${pollReq.status}` });

  const reserved = await req('POST', '/presence', { }, {
    username: 'openai',
    workingOn: 'reserved handle check',
  });
  rows.push({ label: 'Reserved handle rejection', request: reserved, outcome: `HTTP ${reserved.status}` });

  const invalid = await req('POST', '/presence', { }, {
    username: 'ab',
    workingOn: 'invalid format check',
  });
  rows.push({ label: 'Invalid handle rejection', request: invalid, outcome: `HTTP ${invalid.status}` });

  const passFail = [];
  passFail.push(['register', token ? 'PASS' : 'FAIL']);
  passFail.push(['confirm', inPresence ? 'PASS' : 'FAIL']);
  passFail.push(['heartbeat', heartbeatReq.status >= 200 && heartbeatReq.status < 300 ? 'PASS' : 'FAIL']);
  passFail.push(['send', messageReq.status >= 200 && messageReq.status < 300 ? 'PASS' : 'FAIL']);
  passFail.push(['poll', pollReq.status >= 200 && pollReq.status < 300 ? 'PASS' : 'FAIL']);
  passFail.push(['reserved', reserved.status === 403 ? 'PASS' : 'FAIL']);
  passFail.push(['invalid', invalid.status >= 400 && invalid.status < 500 ? 'PASS' : 'FAIL']);

  console.log('SUMMARY');
  for (const row of rows) {
    console.log('---');
    console.log(row.label);
    console.log(JSON.stringify({ request: row.request.requestBody || row.request.url || row.request, response: row.request.responseBody, status: row.request.status }, null, 2));
  }
  console.log('---');
  console.log('RESULTS');
  console.log('public_key', `ed25519:${pub}`);
  console.log('requested_bearer_token', !!token);
  console.log('spec_and_registry_pass_fail', JSON.stringify(passFail));
})();
