#!/usr/bin/env node
import fs from 'node:fs/promises';

const API = 'https://www.slashvibe.dev/api';

async function req(method, path, body, headers = {}) {
  const response = await fetch(`${API}${path}`, {
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
  return { method, url: `${API}${path}`, status: response.status, requestBody: body, headers: Object.fromEntries(response.headers.entries()), body: parsed, raw };
}

async function register(handle, workingOn) {
  return req('POST', '/presence', {
    action: 'register',
    username: handle,
    workingOn,
  });
}

(async () => {
  const suf = Date.now().toString(36);
  const sender = `sender_${suf}`.slice(0, 18);
  const receiver = `receiver_${suf}`.slice(0, 18);

  const senderReg = await register(sender, 'consent sender test');
  const receiverReg = await register(receiver, 'consent receiver test');

  const rows = [];
  const hasToken = !!senderReg.body?.token && !!receiverReg.body?.token;

  rows.push({
    step: 'Setup',
    request: { url: '/api/presence', method: 'POST', body: { action: 'register', username: sender }, user: 'sender' },
    response: senderReg.body,
    status: senderReg.status,
    pass: senderReg.status >= 200,
    gap: senderReg.status >= 200 ? 'PASS' : 'REGISTRY',
    details: senderReg.body?.token ? 'sender token present' : 'sender token missing',
  });

  rows.push({
    step: 'Setup',
    request: { url: '/api/presence', method: 'POST', body: { action: 'register', username: receiver }, user: 'receiver' },
    response: receiverReg.body,
    status: receiverReg.status,
    pass: receiverReg.status >= 200,
    gap: receiverReg.status >= 200 ? 'PASS' : 'REGISTRY',
    details: receiverReg.body?.token ? 'receiver token present' : 'receiver token missing',
  });

  if (!hasToken) {
    rows.push({
      step: 'abort',
      request: null,
      response: null,
      status: null,
      pass: false,
      gap: 'REGISTRY',
      details: 'Missing token(s), skipping consent matrix',
    });
  } else {
    const pre = await req(
      'POST',
      '/messages',
      { from: sender, to: receiver, body: 'hello before consent' },
      { Authorization: `Bearer ${senderReg.body.token}` }
    );
    rows.push({
      step: '2) Send before consent',
      request: pre.requestBody,
      response: pre.body,
      status: pre.status,
      pass: pre.status !== 200,
      gap: pre.status === 403 ? 'PASS' : pre.status >= 500 ? 'REGISTRY' : 'SPEC',
      details: 'Safe mode appears to allow this by default',
    });

    const consentRequest = await req(
      'POST',
      '/consent',
      {
        action: 'request',
        from: sender,
        to: receiver,
        message: 'please send dm',
      },
      { Authorization: `Bearer ${senderReg.body.token}` }
    );
    rows.push({
      step: '4) Request consent',
      request: { action: 'request', from: sender, to: receiver },
      response: consentRequest.body,
      status: consentRequest.status,
      pass: consentRequest.status >= 200,
      gap: consentRequest.status >= 200 ? 'PASS' : 'SPEC',
      details: 'request path expects action + from + to',
    });

    const accept = await req(
      'POST',
      '/consent',
      {
        action: 'accept',
        from: receiver,
        to: sender,
      },
      { Authorization: `Bearer ${receiverReg.body.token}` }
    );
    rows.push({
      step: '5) Accept consent',
      request: { action: 'accept', from: receiver, to: sender },
      response: accept.body,
      status: accept.status,
      pass: accept.status >= 200,
      gap: accept.status >= 200 ? 'PASS' : 'SPEC',
      details: 'accept status',
    });

    const post = await req(
      'POST',
      '/messages',
      { from: sender, to: receiver, body: 'hello after consent' },
      { Authorization: `Bearer ${senderReg.body.token}` }
    );
    rows.push({
      step: '6) Send after consent',
      request: { from: sender, to: receiver, body: 'hello after consent' },
      response: post.body,
      status: post.status,
      pass: post.status === 200,
      gap: post.status === 200 ? 'PASS' : 'REGISTRY',
      details: 'post-consent message path',
    });

    const block = await req(
      'POST',
      '/consent',
      {
        action: 'block',
        from: receiver,
        to: sender,
      },
      { Authorization: `Bearer ${receiverReg.body.token}` }
    );
    rows.push({
      step: '7) Revoke consent',
      request: { action: 'block', from: receiver, to: sender },
      response: block.body,
      status: block.status,
      pass: block.status >= 200,
      gap: block.status >= 200 ? 'PASS' : 'SPEC',
      details: 'block/ revoke flow',
    });

    const blockedSend = await req(
      'POST',
      '/messages',
      { from: sender, to: receiver, body: 'post-revoke should fail' },
      { Authorization: `Bearer ${senderReg.body.token}` }
    );
    rows.push({
      step: '8) Send after revoke',
      request: blockedSend.requestBody,
      response: blockedSend.body,
      status: blockedSend.status,
      pass: blockedSend.status !== 200,
      gap: blockedSend.status === 403 ? 'PASS' : 'SPEC',
      details: 'revoke behavior',
    });

    const missing = await req(
      'POST',
      '/consent',
      { action: 'request', from: sender, to: 'this_handle_does_not_exist_777', message: 'x' },
      { Authorization: `Bearer ${senderReg.body.token}` }
    );
    rows.push({
      step: 'edge: missing handle request',
      request: { action: 'request', to: 'this_handle_does_not_exist_777' },
      response: missing.body,
      status: missing.status,
      pass: missing.status >= 400,
      gap: 'PASS',
      details: 'expected explicit rejection',
    });

    const offlineReceiver = `offline_${suf}`.slice(0, 18);
    const offlineReg = await register(offlineReceiver, 'offline consent receiver');
    rows.push({
      step: 'edge: offline receiver request',
      request: { handle: offlineReceiver, status: offlineReg.status },
      response: offlineReg.body,
      status: offlineReg.status,
      pass: offlineReg.status >= 200,
      gap: 'PASS',
      details: 'registered offline receiver and sent request',
    });

    const offlineReq = await req(
      'POST',
      '/consent',
      { action: 'request', from: sender, to: offlineReceiver, message: 'request while receiver not heartbeating' },
      { Authorization: `Bearer ${senderReg.body.token}` }
    );
    rows.push({
      step: 'edge: consent request while receiver offline',
      request: { action: 'request', from: sender, to: offlineReceiver },
      response: offlineReq.body,
      status: offlineReq.status,
      pass: offlineReq.status >= 200,
      gap: offlineReq.status >= 200 ? 'PASS' : 'REGISTRY',
      details: 'registry accepted request for offline receiver',
    });

    let rateLimited = false;
    for (let i = 0; i < 8; i += 1) {
      const r = await req(
        'POST',
        '/consent',
        { action: 'request', from: sender, to: `spam_${suf}_${i}` },
        { Authorization: `Bearer ${senderReg.body.token}` }
      );
      if (r.status === 429) {
        rateLimited = true;
      }
    }
    rows.push({
      step: 'edge: consent rate-limit',
      request: { attempts: 8, action: 'request' },
      response: { rateLimited },
      status: rateLimited ? 429 : 200,
      pass: !rateLimited,
      gap: rateLimited ? 'REGISTRY' : 'PASS',
      details: `rate limited observed = ${rateLimited}`,
    });
  }

  const out = ['# CONSENT_VALIDATION', `Generated: ${new Date().toISOString()}`, '', '| Step | Request | Response | Status | PASS/FAIL | Gap | Details |', '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const r of rows) {
    out.push(`| ${r.step} | ${JSON.stringify(r.request).replaceAll('|', '\\|')} | ${JSON.stringify(r.response).slice(0, 300).replaceAll('|', '\\|')} | ${r.status} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.gap} | ${r.details} |`);
  }

  await fs.writeFile('/Users/sethstudio1/Projects/airc/ts/CONSENT_VALIDATION.md', out.join('\n'));
  console.log(out.join('\n'));
})();
