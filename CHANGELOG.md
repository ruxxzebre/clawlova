# Changelog

## Init workspace

Set up monorepo scaffold with npm workspaces. Docker Compose stack with three services: `openclaw-init` (config generation), `openclaw-gateway` (AI agent runtime), `openclaw-cli` (manual interaction). Init script creates OpenClaw config with sane defaults and generates a bootstrap gateway token.

## Chat app with OpenClaw integration

Initialized a TanStack Start (React 19 SSR) app with file-based routing. Built chat UI with streaming responses, markdown rendering, and expandable tool call cards showing status, inputs, and outputs.

Server-side `/api/chat` route streams responses via SSE using `@tanstack/ai`. Initial OpenClaw integration was via HTTP adapter (later replaced by WebSocket bridge). Added dark/light theme toggle.

## WebSocket adapter

Replaced the HTTP `/v1/chat/completions` adapter with a native WebSocket gateway bridge. The bridge connects directly to the OpenClaw gateway, handles the connect/challenge/chat protocol, and translates gateway events into TanStack AI `StreamChunk` format.

Tool call events are now first-class — `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END` chunks flow through to the UI. Added an `AsyncQueue` utility for bridging push-based WebSocket events to pull-based async iteration.

## Device auto-auth

Implemented Ed25519 device identity generation — keypair is created on first run and persisted to disk. The session bridge responds to `connect.challenge` events with a signed payload. Device token is cached after successful connect and reused for subsequent connections.

Auth mode resolution: prefers cached device token, falls back to bootstrap gateway token, throws a clear error if neither exists.

## Device auth bootstrap service

Added a `cockpit-bootstrap` Docker service that automatically pairs the cockpit device with the OpenClaw gateway on first startup. Created a standalone WebSocket probe script that performs the connect handshake and persists the device token, with a fallback to CLI-based approval.

## Config generator

Added a `/config` page with a form-based UI to view and update `openclaw.json` without manual editing. Five sections cover auth profiles, model, tools, gateway, and plugins. Server endpoints (`GET/PUT /api/config`) handle validation and merging, preserving non-editable sections and masking secrets.

Added a `/api/models` endpoint that fetches available models live from provider APIs with hardcoded fallback lists. Auth profiles only write OpenClaw-recognized fields — API keys stay in env vars.

Gateway hot-reloads most changes; UI warns when container-level settings require a restart.
