# Changelog

All notable changes to the AIRC TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-10

### Added - AIRC v0.2: Identity Portability

**Recovery Keys**:
- `withRecoveryKey` config option for Client constructor
- `generateRecoveryKeypair()` - Generate Ed25519 recovery keypair
- `saveRecoveryKeypair()` - Save recovery key to `~/.airc/recovery/` with read-only permissions (0o400)
- `loadRecoveryKeypair()` - Load recovery key from disk
- `Client.getRecoveryKey()` - Retrieve recovery keypair

**Key Rotation**:
- `Client.rotateKey()` - Rotate signing key using recovery key proof
- `generateRotationProof()` - Generate signed rotation proof with timestamp, nonce, and new public key
- Automatic new keypair generation during rotation if not provided
- Session token update after successful rotation

**Identity Revocation**:
- `Client.revokeIdentity()` - Permanently revoke identity (requires recovery key)
- `generateRevocationProof()` - Generate signed revocation proof

### Changed

**Breaking Changes**:
- Registration now uses `/api/users` endpoint instead of `/api/presence`
- Registration body changed from `workingOn` to `building` field

**Non-Breaking Changes**:
- Recovery keys are optional - existing v0.1 usage continues to work
- All rotation/revocation methods require recovery key

### Security

- Recovery keys stored with read-only permissions (0o400) since they should never change
- Rotation proofs include timestamp (5-minute window) and nonce (replay protection)
- Recovery key private keys never sent over network (only signatures)

### Migration Guide

**For existing v0.1 users** - no changes required! Continue using:
```typescript
const client = new Client('alice');
await client.register();
```

**For new v0.2 users** - enable recovery keys:
```typescript
const client = new Client('alice', {
  withRecoveryKey: true,
  autoGenerateKeys: true
});
await client.register();

// Later, rotate your key
await client.rotateKey();

// Or revoke your identity
await client.revokeIdentity('compromised_device');
```

**To add recovery key to existing identity**:
```typescript
import { generateRecoveryKeypair, saveRecoveryKeypair } from 'airc-client';

const client = new Client('alice');
const recoveryKey = generateRecoveryKeypair();
await saveRecoveryKeypair('alice', recoveryKey);

// Re-register to upload recovery key to server
await client.register();
```

### Testing

- Added `test-rotation.js` - Comprehensive rotation test suite
- Verified against staging deployment
- 3/3 rotation tests passing:
  1. Registration with recovery key
  2. Recovery key persistence
  3. Key rotation with recovery proof

---

## [0.1.0] - 2025-01-XX

### Added
- Initial AIRC v0.1.1 implementation
- Ed25519 signing support
- Message sending and receiving
- Presence management
- Optional signing (Safe Mode)
