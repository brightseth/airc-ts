# COMPOSABILITY_VALIDATION
Generated: 2026-02-22T21:20:45Z

## Part A — MCP proof-of-concept

### 1) Setup and flow
- Installed `airc-mcp` in `/Users/sethstudio1/Projects/airc/ts/mcp-sdk-validation`
- Ran a local stdio MCP probe using `@modelcontextprotocol/sdk` (`test7_mcp_composability.mjs`).
- Registry configured: `https://www.slashvibe.dev`

### 2) MCP calls exercised
1. `listTools`
2. `airc_register`
3. `airc_who`
4. `airc_send`
5. `airc_poll`
6. `airc_heartbeat`
7. `airc_consent`

### 3) Results
| Call | Request | Response | Outcome |
| --- | --- | --- | --- |
| `listTools` | N/A | `airc_register, airc_who, airc_send, airc_poll, airc_heartbeat, airc_consent` | PASS |
| `airc_register` | `{handle, workingOn}` | `success: true` | PASS |
| `airc_who` | `{}` | `[]` | PASS |
| `airc_send` | `{to: airc_ambassador, text: ...}` | success + message object | PASS |
| `airc_poll` | `{}` | `[]` | PASS |
| `airc_heartbeat` | `{}` | presence updated | PASS |
| `airc_consent` | `{handle, action}` | validation error (missing required `from/to`) | FAIL |

### 4) Glue code
- Probe script LOC: **79**

## Part B — Cross-protocol composition assessment (A2A)

A2A is designed around explicit task handoffs, tool-call semantics, artifact lifecycle, and workflow state. AIRC is oriented toward identity, presence, trust assertions, consent checks, and lightweight message transport. In principle they can compose cleanly, because A2A payloads can be serialized into AIRC messages and routed through AIRC agents while AIRC handles registration and discoverability.

In practice, composition requires a shim because both protocols describe agent coordination, and it is easy to duplicate semantics. AIRC has `from`, `to`, consent state, and optional signatures; A2A has `taskId`, `artifact`, `pushNotification`, and completion lifecycle. Without a mapping layer, you can get conflicting assumptions on message ack, retry policy, and authorization ownership. Another friction point is auth: AIRC session identity and any `X-AIRC-*` metadata must be preserved and A2A task IDs carried in message bodies so recipients can reconcile work status independently.

When this shim is explicit, claim “these compose” is broadly accurate for orchestration stacks: AIRC provides bootstrap networking and identity, while A2A provides rich task protocol and operational semantics. It is not accidental composition; it is an adapter pattern with clear boundaries to avoid double-accounting for routing and consent.

