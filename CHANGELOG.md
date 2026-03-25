# Changelog

All notable changes to this project are documented in this file, in reverse chronological order.

## Config generator (unreleased)

- Added `/config` page — form-based UI to view and update `openclaw.json` without manual editing
- Five config sections: Auth Profiles, Model, Tools, Gateway, Plugins
- Created `GET /api/config` and `PUT /api/config` server endpoints with Zod validation
- Config merge preserves non-editable sections (`hooks`, `commands`, `session`, etc.) and masks secrets in API responses
- Created `GET /api/models?provider=` endpoint — fetches available models live from provider APIs (OpenAI `/v1/models`, Anthropic `/v1/models`) with hardcoded fallback lists
- Model dropdown auto-selects first available model when switching providers
- Auth profiles only write OpenClaw-recognized fields (`provider`, `mode`) — API keys stay in env vars; UI shows which env var to set per provider
- `stripUnknownAuthFields()` prevents writing unrecognized fields that would cause OpenClaw to reject the entire config reload
- Gateway hot-reloads most changes; UI warns when gateway-level settings (port, bind, auth) require a container restart
- Added Settings icon nav link in header
- Removed `:ro` from cockpit's `openclaw-config` Docker volume mount to enable config writes
- Added `ANTHROPIC_API_KEY` and `GOOGLE_API_KEY` as optional env vars in `docker-compose.yml` for multi-provider support
- Made `OPENAI_API_KEY` optional (no longer hard-fails if absent) to support non-OpenAI providers
- Updated `README.md` with config generator docs, updated project structure, and multi-provider env vars
- Fixed Zod v4 `z.record()` validation — requires explicit key schema (`z.record(z.string(), valueSchema)`)

## Cleanup & documentation

- Removed unused legacy HTTP adapter (`openclaw-adapter.ts`) — fully replaced by the WebSocket session bridge
- Updated `.gitignore` with entries for logs, device identity files, and gateway tokens
- Added `CHANGELOG.md` and `README.md` with architecture write-up

## Device auth bootstrap service (`b2d6e3a`)

- Added `cockpit-bootstrap` Docker service that automatically pairs the cockpit device with the OpenClaw gateway on first startup
- Created `scripts/openclaw-device-connect.mjs` — standalone WebSocket probe that performs the connect handshake and persists the device token
- Created `scripts/local-bootstrap.sh` — entrypoint for the bootstrap container; waits for the gateway, runs the device connect probe, and falls back to CLI-based approval if loopback auto-approve is unavailable
- Cockpit service now depends on `cockpit-bootstrap` completing successfully before starting
- Fixed `client.mode` from `"tui"` to `"cli"` across all three files that send connect params (gateway schema rejects other values)

## Device auto-auth (`285789f`)

- Implemented Ed25519 device identity generation in the session bridge — keypair is created on first run and persisted to `/var/lib/cockpit/openclaw-device.json`
- Added challenge-response signing: the bridge responds to `connect.challenge` events with a signed payload using the device private key
- Device token is cached to disk after successful connect and reused for subsequent connections (skips bootstrap auth)
- Auth mode resolution: prefers cached device token, falls back to bootstrap gateway token, throws a clear error if neither exists
- Added regression tests for `resolveAuthMode`, `translateGatewayEvent`, and the full auth flow (18 tests)

## WebSocket adapter (`991fa23`)

- Replaced the HTTP `/v1/chat/completions` adapter with a native WebSocket gateway bridge (`openclaw-session-bridge.ts`)
- The bridge connects directly to the OpenClaw gateway WebSocket, handles the connect/challenge/chat protocol, and translates gateway events into TanStack AI `StreamChunk` format
- `translateGatewayEvent()` maps three event streams: `assistant` (text deltas), `tool` (start/result/error phases), and lifecycle events (run finished)
- Tool call events are now first-class: `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END` chunks flow through to the UI
- Added `AsyncQueue` utility for bridging push-based WebSocket events to pull-based async iteration
- Created `scripts/openclaw-ws-chat.mjs` as a standalone CLI tool for testing WebSocket chat (`npm run openclaw:ws`)

## Chat app with OpenClaw integration (`b5b2ddb`)

- Initialized TanStack Start (React 19 SSR) application with file-based routing
- Chat UI: message input with streaming response display, markdown rendering via `react-markdown` + `remark-gfm`
- Tool call display: expandable cards showing tool name, status (running/completed/error), input parameters, and output
- Created `tool-call-display.ts` library for normalizing tool call parts into view models
- Server-side `/api/chat` route streams responses via Server-Sent Events using `@tanstack/ai`
- Initial OpenClaw integration via HTTP adapter (later replaced by WebSocket bridge)
- Dark/light theme toggle with system preference detection
- Header, footer, and card UI components with Tailwind CSS 4

## Init workspace (`6b92365`)

- Monorepo scaffold with npm workspaces (`packages/cockpit`)
- Docker Compose stack: `openclaw-init` (config generation), `openclaw-gateway` (AI agent runtime), `openclaw-cli` (manual interaction)
- `scripts/openclaw-init.sh` — creates OpenClaw config with sane defaults, generates bootstrap gateway token, enables the chatCompletions HTTP endpoint
- `.env.example` with required/optional environment variables
