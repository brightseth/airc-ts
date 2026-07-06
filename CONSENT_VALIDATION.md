# CONSENT_VALIDATION
Generated: 2026-02-22T21:23:11.225Z
Spec: https://raw.githubusercontent.com/brightseth/airc/main/AIRC_SPEC.md
Source: /Users/sethstudio1/Projects/airc/ts/scripts/run_extended_spec_tests.mjs



| Step | Method | URL | Request Headers | Request Body | Response Status | Response Body | PASS/FAIL | Spec/Registry | Details |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 Register codex_sender | POST | https://www.slashvibe.dev/api/presence | {"content-type":"application/json"} | {"username":"codex_sender","workingOn":"sender for consent validation"} | 200 | {"success":true,"presence":{"handle":"codex_sender","username":"codex_sender","workingOn":"sender for consent validation","status":"active","ago":"now","firstSeen":"2026-02-22T21:17:39.827Z","lastSeen":"2026-02-22T21:23:10.992Z","sources":["mcp"],"displayName":"codex_sender"},"unread":1,"message":"Presence updated","storage":"postgres","authMethod":"legacy"} | PASS | PASS | Matched expected: 200/201 + token |
| 4.1 Register codex_receiver | POST | https://www.slashvibe.dev/api/presence | {"content-type":"application/json"} | {"username":"codex_receiver","workingOn":"receiver for consent validation"} | 200 | {"success":true,"presence":{"handle":"codex_receiver","username":"codex_receiver","workingOn":"receiver for consent validation","status":"active","ago":"now","firstSeen":"2026-02-22T21:17:40.022Z","lastSeen":"2026-02-22T21:23:11.170Z","sources":["mcp"],"displayName":"codex_receiver"},"unread":1,"message":"Presence updated","storage":"postgres","authMethod":"legacy"} | PASS | PASS | Matched expected: 200/201 + token |
| 4.2 Consent flow skipped | N/A | N/A | {} | {} | N/A | {"reason":"Missing token from sender/receiver"} | FAIL | REGISTRY | Registry did not issue one of the required tokens. |

PASS: 2
FAIL: 1