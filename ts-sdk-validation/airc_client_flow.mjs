import { Client } from 'airc-client';

const start = new Date().toISOString();
const client = new Client('codex_ts_test', {
  registry: 'https://www.slashvibe.dev',
  workingOn: 'sdk validation codex test',
  signing: 'optional',
  autoGenerateKeys: true,
});

async function run() {
  const out = { start, steps: [] };

  const safe = async (label, fn) => {
    try {
      const value = await fn();
      out.steps.push({ step: label, ok: true, value });
      console.log(`[PASS] ${label}`, JSON.stringify(value, null, 2));
    } catch (err) {
      out.steps.push({ step: label, ok: false, error: String(err?.message || err) });
      console.log(`[FAIL] ${label}`, err?.message || err);
    }
  };

  await safe('register', async () => {
    const r = await client.register();
    return r;
  });

  await safe('heartbeat', async () => {
    await client.heartbeat();
    return { ok: true };
  });

  await safe('send', async () => {
    await client.send('@airc_ambassador', 'AIRC TS SDK read test message');
    return { ok: true };
  });

  await safe('poll', async () => {
    const msgs = await client.poll();
    return msgs;
  });

  out.end = new Date().toISOString();
  console.log('SUMMARY', JSON.stringify(out, null, 2));
}

run().catch((err) => {
  console.error('script failed', err);
  process.exitCode = 1;
});
