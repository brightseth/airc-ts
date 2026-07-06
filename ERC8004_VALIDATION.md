# ERC8004_VALIDATION
Generated: 2026-02-22T21:23:12.481Z
Spec: https://raw.githubusercontent.com/brightseth/airc/main/AIRC_SPEC.md
Source: /Users/sethstudio1/Projects/airc/ts/scripts/run_extended_spec_tests.mjs

- Security posture: claiming onchain_identity is a trust claim until independently verified on-chain.
- Malicious handle takeover is prevented only when registry does signed ownership checks; otherwise vulnerable to self-declaration.
- Requiring periodic verification on token transfer is necessary to avoid stale bindings.

- Completeness score: 6/10 (good intent, incomplete practical verification guidance; strong on-chain tie-in but no direct AIRC enforcement contract).

| Step | Method | URL | Request Headers | Request Body | Response Status | Response Body | PASS/FAIL | Spec/Registry | Details |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 6.1 Register agent with onchain_identity claim | POST | https://www.slashvibe.dev/api/presence | {"content-type":"application/json"} | {"username":"codex_erc8004_mly98aag","workingOn":"erc8004 linking test","onchain_identity":{"standard":"ERC-8004","erc8004_token_id":42,"chain":"eip155:1","contract_address":"0x5FbDB2315678afecb367f032d93F642f64180aa3","registration_file":"ipfs://QmXk8Pf5BxVnKbqGc3CwZjN8DvF1Pg5LdVpFvL3JhGVe7","verified":false,"verified_at":null,"public_key":"ed25519:MCowBQYDK2VwAyEAGA6UUckg8CVX8JxAerSCjrLct4+cvedid3auJqiYVhM="},"public_key":"ed25519:MCowBQYDK2VwAyEAGA6UUckg8CVX8JxAerSCjrLct4+cvedid3auJqiYVhM="} | 200 | {"success":true,"presence":{"handle":"codex_erc8004_mly98aag","username":"codex_erc8004_mly98aag","workingOn":"erc8004 linking test","status":"active","ago":"now","firstSeen":"2026-02-22T21:23:12.424Z","lastSeen":"2026-02-22T21:23:12.424Z","sources":["mcp"],"displayName":"codex_erc8004_mly98aag"},"unread":0,"message":"Presence updated","storage":"postgres","authMethod":"legacy"} | PASS | PASS | Matched expected: 200/201 |
| 6.2 Local verification of signed challenge | local | local challenge | {} | {"handle":"codex_erc8004_mly98aag","action":"erc8004_link_challenge","tokenId":42,"contract_address":"0x5FbDB2315678afecb367f032d93F642f64180aa3","chain":"eip155:1","nonce":199374,"issuedAt":"2026-02-22T21:23:12.481Z"} | local | {"valid":true} | PASS | PASS | Signature over deterministic challenge verified by local verifier. |
| 6.3 Malicious signature should fail | local | local challenge | {} | {"handle":"codex_erc8004_mly98aag","action":"erc8004_link_challenge","tokenId":42,"contract_address":"0x5FbDB2315678afecb367f032d93F642f64180aa3","chain":"eip155:1","nonce":199374,"issuedAt":"2026-02-22T21:23:12.481Z"} | local | {"valid":false} | PASS | PASS | Different key does not verify against claimed identity key. |
| 6.4 AIRC-side link verification requirement | analysis | spec checklist | {} | {"onchain_identity":{"standard":"ERC-8004","erc8004_token_id":42,"chain":"eip155:1","contract_address":"0x5FbDB2315678afecb367f032d93F642f64180aa3","registration_file":"ipfs://QmXk8Pf5BxVnKbqGc3CwZjN8DvF1Pg5LdVpFvL3JhGVe7","verified":false,"verified_at":null,"public_key":"ed25519:MCowBQYDK2VwAyEAGA6UUckg8CVX8JxAerSCjrLct4+cvedid3auJqiYVhM="}} | N/A | {"onchain_identity_verifiable_without_onchain_lookup":false,"needed_checks":["ERC-8004 owner match","registration file includes airc","challenge signature"]} | PASS | PASS | Registry-level onchain verification requires external chain access and cannot be completed from registry payload alone. |

PASS: 4
FAIL: 0