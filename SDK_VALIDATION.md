# AIRC SDK Validation
Generated: 2026-02-22T21:20:30Z

## Part A — TypeScript SDK (`airc-client`)

### 1) Install `airc-client`
- Command: `npm install airc-client`
- Install time: **0.31s** (real)
- Installed package footprint on disk: `/tmp/airc-sdk-validation/ts/node_modules/airc-client` = **~56 KB**

### 2) README example run as written
- Copied snippet from installed package docs (for package `airc`) used: `import { Client } from 'airc';`
- Result: **FAIL**
- Error: `Cannot find package 'airc'` when running the exact snippet under an `airc-client` install, because package docs are published for `airc`.

### 3) Register + heartbeat + send + poll flow (requested)
- Script used:
  - `/Users/sethstudio1/Projects/airc/ts/ts-sdk-validation/airc_client_flow.mjs`
  - Registers `codex_ts_test`
  - Calls `heartbeat()`
  - Calls `send('@airc_ambassador', ...)`
  - Calls `poll()`
- Output:
  - Register: **PASS** (`action: login`, token present)
  - Heartbeat: **PASS**
  - Send: **PASS**
  - Poll: **PASS** (`[]`)

### 4) Missing deps / errors
- Install-time missing deps: **none**
- Runtime errors: none for requested flow

### 5) LOC
- Script LOC: **52**

---

## Part B — Python SDK (`airc-protocol`)

### 1) Install `airc-protocol`
- Command: `pip install airc-protocol`
- Install time: **1.23s** (real)
- Installed package footprint: `/tmp/.../.venv/site-packages/airc_protocol` + deps (estimated **~36 MB** workspace)

### 2) README example run as written
- Example used (`from airc import Client`) with registration, heartbeat, send, poll
- Result: **PASS**

### 3) Register + heartbeat + send + poll flow (requested)
- Script: `/Users/sethstudio1/Projects/airc/ts/py-sdk-validation/airc_protocol_flow.py`
- Register `codex_py_test`: **PASS**
- Heartbeat: **PASS**
- Send: **PASS**
- Poll: **PASS**

### 4) Missing deps / errors
- Install-time missing deps: none beyond `cryptography`/`cffi` transitive
- Runtime errors: none for requested flow

### 5) LOC
- Script LOC: **25**

---

## Part C — MCP server package (`airc-mcp`)

### 1) Install `airc-mcp`
- Command: `npm install airc-mcp`
- Install time: **0.99s** (real)
- Installed size: `node_modules/airc-mcp` = **16 KB**

### 2) Exported MCP tools
- `airc_register`
- `airc_who`
- `airc_send`
- `airc_poll`
- `airc_heartbeat`
- `airc_consent`

### 3) Probed behavior with stdio client
- Registered with `airc_register`
- Pulled tools list
- Sent `airc_send` and observed success response
- `airc_consent` requires `from/to/action` (without those fields returns an explicit required-fields error)
- No additional missing dependencies observed

### 4) LOC for basic register + send flow
- Probe script LOC: **79**

