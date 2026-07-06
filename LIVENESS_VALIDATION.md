# LIVENESS_VALIDATION
Generated: 2026-02-22T21:23:12.949Z
Spec: https://raw.githubusercontent.com/brightseth/airc/main/AIRC_SPEC.md
Source: /Users/sethstudio1/Projects/airc/ts/scripts/run_extended_spec_tests.mjs


| Step | Method | URL | Request Headers | Request Body | Response Status | Response Body | PASS/FAIL | Spec/Registry | Details |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8.1 Register liveness target | POST | https://www.slashvibe.dev/api/presence | {"content-type":"application/json"} | {"username":"codex_liveness_test","workingOn":"liveness test"} | 200 | {"success":true,"presence":{"handle":"codex_liveness_test","username":"codex_liveness_test","workingOn":"liveness test","status":"active","ago":"now","firstSeen":"2026-02-22T21:08:07.973Z","lastSeen":"2026-02-22T21:23:12.654Z","sources":["mcp"],"displayName":"codex_liveness_test"},"unread":1,"message":"Presence updated","storage":"postgres","authMethod":"legacy"} | PASS | PASS | Matched expected: 2xx |
| 8.1 Register sender | POST | https://www.slashvibe.dev/api/presence | {"content-type":"application/json"} | {"username":"codex_liveness_sender","workingOn":"liveness sender"} | 200 | {"success":true,"presence":{"handle":"codex_liveness_sender","username":"codex_liveness_sender","workingOn":"liveness sender","status":"active","ago":"now","firstSeen":"2026-02-22T21:17:41.426Z","lastSeen":"2026-02-22T21:23:12.894Z","sources":["mcp"],"displayName":"codex_liveness_sender"},"unread":1,"message":"Presence updated","storage":"postgres","authMethod":"legacy"} | PASS | PASS | Matched expected: 2xx |
| 8.2 Skipped | N/A | N/A | {} | {} | N/A | {"reason":"Missing token(s) for heartbeat/poll loop"} | FAIL | REGISTRY | Could not execute liveness loops without live auth tokens. |

PASS: 2
FAIL: 1