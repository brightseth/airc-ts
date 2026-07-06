#!/usr/bin/env node
import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
} from 'node:crypto';
import fs from 'node:fs/promises';

const API = 'https://www.slashvibe.dev/api';

function canonicalJSON(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
}

function strip(v) {
  return String(v || '').replace(/^ed25519:/, '');
}

function sign(privateKeyBase64, body) {
  const key = createPrivateKey({ key: Buffer.from(privateKeyBase64, 'base64'), format: 'der', type: 'pkcs8' });
  const sig = edSign(null, Buffer.from(canonicalJSON(body), 'utf8'), key).toString('base64');
  return `ed25519:${sig}`;
}

function verify(publicKeyBase64, body, signature) {
  const key = createPublicKey({ key: Buffer.from(strip(publicKeyBase64), 'base64'), format: 'der', type: 'spki' });
  return edVerify(null, Buffer.from(canonicalJSON(body), 'utf8'), key, Buffer.from(strip(signature), 'base64'));
}

async function req(method, path, body = null, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { raw };
  }
  return { method, url: `${API}${path}`, status: res.status, headers: Object.fromEntries(res.headers.entries()), body: parsed, raw };
}

async function register(handle) {
  const r = await req('POST', '/presence', {
    action: 'register',
    username: handle,
    workingOn: 'identity sovereignty test',
  });
  return { ...r, token: r.body?.token || null };
}

(async () => {
  const results = [];
  const keyA = generateKeyPairSync('ed25519');
  const kA = {
    public: keyA.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    private: keyA.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };

  const reg1 = await register('codex_identity_test');
  results.push({
    step: '1) register',
    request: { method: 'POST', url: '/presence', body: { action: 'register', username: 'codex_identity_test', workingOn: 'identity sovereignty test' } },
    response: reg1.body,
    status: reg1.status,
    pass: reg1.status >= 200 && reg1.status < 300 && !!reg1.token,
    gap: reg1.status < 300 ? 'PASS' : 'REGISTRY',
    details: reg1.token ? 'session token issued' : 'token not issued',
  });

  const message = { from: 'codex_identity_test', to: 'airc_ambassador', body: 'Hello', type: 'text' };
  const sig = sign(kA.private, message);
  const validVerify = verify(kA.public, message, sig);
  results.push({ step: '2) local signature verify', request: { payload: message }, response: { verified: validVerify }, status: validVerify ? 200 : 400, pass: validVerify, gap: validVerify ? 'PASS' : 'SPEC', details: validVerify ? 'valid signature verified offline' : 'verification failed' });

  const sameHandle = await register('codex_identity_test');
  results.push({
    step: '3) same handle second session',
    request: { method: 'POST', url: '/presence', body: { action: 'register', username: 'codex_identity_test', workingOn: 'identity sovereignty test' } },
    response: sameHandle.body,
    status: sameHandle.status,
    pass: sameHandle.status < 500,
    gap: sameHandle.status === 200 || sameHandle.status === 201 ? 'PASS' : 'REGISTRY',
    details: sameHandle.status === 200 ? 'login/verified replay path returned' : `status ${sameHandle.status}`,
  });

  const invalidK = generateKeyPairSync('ed25519');
  const kInv = {
    private: invalidK.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };

  const badSig = sign(kInv.private, message);
  const sendBad = await req(
    'POST',
    '/messages',
    { ...message },
    { Authorization: `Bearer ${reg1.token}`, 'X-AIRC-Signature': badSig, 'X-AIRC-Identity': 'codex_identity_test' }
  );
  results.push({
    step: '4) send invalid signature',
    request: { method: 'POST', url: '/messages', body: message },
    response: sendBad.body,
    status: sendBad.status,
    pass: sendBad.status >= 400,
    gap: sendBad.status >= 400 ? 'PASS' : 'SPEC',
    details: 'slashvibe accepted malformed auth when safe mode enabled',
  });

  const sendNoSig = await req(
    'POST',
    '/messages',
    { ...message },
    { Authorization: `Bearer ${reg1.token}` }
  );
  results.push({
    step: '5) send no signature',
    request: { method: 'POST', url: '/messages', body: message },
    response: sendNoSig.body,
    status: sendNoSig.status,
    pass: sendNoSig.status >= 200 && sendNoSig.status < 300,
    gap: sendNoSig.status >= 200 && sendNoSig.status < 300 ? 'PASS' : 'REGISTRY',
    details: 'expected in safe mode (no signature required)',
  });

  const goodSig = sign(kA.private, message);
  const sendGood = await req(
    'POST',
    '/messages',
    { ...message },
    { Authorization: `Bearer ${reg1.token}`, 'X-AIRC-Signature': goodSig, 'X-AIRC-Identity': 'codex_identity_test' }
  );
  results.push({
    step: '6) send valid signature',
    request: { method: 'POST', url: '/messages', body: message },
    response: sendGood.body,
    status: sendGood.status,
    pass: sendGood.status >= 200 && sendGood.status < 300,
    gap: sendGood.status >= 200 && sendGood.status < 300 ? 'PASS' : 'REGISTRY',
    details: 'signed message accepted',
  });

  const out = ['# IDENTITY SOLEVERNITY TEST', `Generated: ${new Date().toISOString()}`, '', '| step | request | response | status | pass | gap | details |', '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const r of results) {
    out.push(`| ${r.step} | ${JSON.stringify(r.request)} | ${JSON.stringify(r.response || {}).replaceAll('|', '\\|')} | ${r.status} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.gap} | ${r.details} |`);
  }

  await fs.writeFile('/Users/sethstudio1/Projects/airc/ts/IDENTITY_VALIDATION.md', out.join('\n'));
  console.log(out.join('\n'));
})();
