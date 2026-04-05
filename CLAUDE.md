# Clawlova

A chat UI ("cockpit") for the [OpenClaw](https://openclaw.ai) AI agent gateway. pnpm monorepo with a single package at `packages/cockpit`.

## Development

```bash
pnpm install                          # install dependencies
pnpm dev                              # cockpit dev server on :3000 (needs gateway running)
pnpm test --filter=cockpit            # run tests
pnpm openclaw:ws -- "hello"           # test WebSocket chat from CLI
```

## Docker Compose

```bash
docker compose up --build             # start the full stack
```

Services:

| Service | Role |
|---------|------|
| `openclaw-init` | One-shot: generates config + bootstrap gateway token |
| `openclaw-gateway` | AI agent runtime (WebSocket on :18789) |
| `cockpit-bootstrap` | One-shot: generates device keypair, pairs with gateway |
| `cockpit` | Chat web app (port 3000) |
| `openclaw-cli` | Optional: interactive CLI for manual OpenClaw commands |

First startup takes ~60s while OpenClaw initializes and the device is paired.

## Environment Variables

At least one LLM provider API key is required.

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `GOOGLE_API_KEY` | — | Google API key |
| `COCKPIT_PORT` | `3000` | Cockpit web UI port |
| `OPENCLAW_GATEWAY_PORT` | `18789` | Gateway port |

## Gotchas

- **File sending to OpenClaw:** use filesystem paths, not base64 encoding. Base64 does not work with the OpenClaw bridge.
