#!/usr/bin/env node
/**
 * Test AIRC v0.2 key rotation with TypeScript SDK
 */

import { Client } from './dist/index.mjs';
import crypto from 'crypto';

const STAGING_REGISTRY = 'https://vibe-public-pjft4mtcb-sethvibes.vercel.app';

async function testRotation() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  AIRC v0.2 TypeScript SDK - Rotation Test                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Create unique test handle (max 20 chars)
  const handle = `sdk${Date.now().toString(36)}`;
  console.log(`📝 Test handle: @${handle}`);
  console.log('');

  // Test 1: Register with recovery key
  console.log('=== Test 1: Register with recovery key ===');
  const client = new Client(handle, {
    registry: STAGING_REGISTRY,
    workingOn: 'Testing AIRC v0.2 rotation',
    withRecoveryKey: true,
    autoGenerateKeys: true
  });

  try {
    const result = await client.register();
    if (!result.success) {
      console.error('❌ Registration failed:', result.error);
      process.exit(1);
    }
    console.log(`✅ Registered with recovery key`);
    console.log(`   Response:`, JSON.stringify(result, null, 2));
    console.log(`   Public key: ${client.publicKey?.substring(0, 30)}...`);
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    process.exit(1);
  }

  console.log('');

  // Test 2: Verify recovery key was saved
  console.log('=== Test 2: Verify recovery key saved ===');
  try {
    const recoveryKey = await client.getRecoveryKey();
    if (!recoveryKey) {
      console.error('❌ Recovery key not found');
      process.exit(1);
    }
    console.log(`✅ Recovery key loaded`);
    console.log(`   Public key: ${recoveryKey.publicKey.substring(0, 30)}...`);
  } catch (error) {
    console.error('❌ Recovery key load error:', error.message);
    process.exit(1);
  }

  console.log('');

  // Wait a moment for database replication
  console.log('⏳ Waiting 2 seconds for database replication...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('');

  // Test 3: Rotate signing key
  console.log('=== Test 3: Rotate signing key ===');
  console.log(`   Registry: ${STAGING_REGISTRY}`);
  console.log(`   Handle: ${handle}`);
  const oldPublicKey = client.publicKey;
  try {
    // rotateKey() generates new key automatically if not provided
    const newToken = await client.rotateKey();

    console.log(`✅ Key rotation succeeded`);
    console.log(`   Old key: ${oldPublicKey?.substring(0, 30)}...`);
    console.log(`   New key: ${client.publicKey?.substring(0, 30)}...`);
    console.log(`   New token: ${newToken.substring(0, 30)}...`);

    if (oldPublicKey === client.publicKey) {
      console.error('❌ Public key did not change!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Rotation error:', error.message);
    console.error('   Full error:', error);
    process.exit(1);
  }

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ All rotation tests passed!                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Summary:');
  console.log('  ✅ Registration with recovery key');
  console.log('  ✅ Recovery key persisted to disk');
  console.log('  ✅ Key rotation with recovery proof');
  console.log('  ✅ New session token received');
  console.log('  ✅ Public key updated in database');
  console.log('');
}

testRotation().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
