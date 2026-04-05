# Clawlova

A full-stack chat application that connects to an [OpenClaw](https://openclaw.ai) instance running in Docker. Users send messages and receive streaming AI responses with live tool call visualization.

<img src="docs/screenshots/chat.png" alt="Chat Interface" width="600">

## Prerequisites

- **Docker** and **Docker Compose** (v2)
- An **OpenAI API key** (or another LLM provider key supported by OpenClaw)
- **Node.js 22+** and **pnpm** (for local development only)

## Quick Start

```bash
# 1. Clone and enter the repo
git clone <repo-url> && cd clawlova

# 2. Create .env with your API key
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...

# 3. Start the full stack
docker compose up --build

# 4. Open the chat UI
open http://localhost:3000
```

The first startup takes ~60 seconds while OpenClaw initializes its config, the gateway starts, and the cockpit device is automatically paired.

## Architecture

```
┌─────────────┐     SSE      ┌─────────────────┐    WebSocket    ┌──────────────────┐
│  Browser UI  │◄────────────►│  Cockpit Server  │◄──────────────►│ OpenClaw Gateway │
│  (React 19)  │  /api/chat   │  (Nitro/Node.js) │  ws://gw:18789 │   (AI Agent)     │
└─────────────┘              └─────────────────┘                 └──────────────────┘
```

The browser sends each message to the cockpit server, which opens a WebSocket to the OpenClaw gateway, authenticates the device, and streams back AI responses as Server-Sent Events. The UI renders the response in real time with markdown, thinking indicators, and tool call cards.

### Docker Compose Services

| Service | Role |
|---------|------|
| `openclaw-init` | One-shot: generates OpenClaw config and bootstrap gateway token |
| `openclaw-gateway` | The AI agent runtime — accepts WebSocket connections, runs tools |
| `cockpit-bootstrap` | One-shot: generates device keypair, pairs with gateway, persists token |
| `cockpit` | The chat web app — serves UI on port 3000 |
| `openclaw-cli` | Optional: interactive CLI for manual OpenClaw commands |

## Features

- **Streaming responses** — real-time text reveal with animated markdown rendering
- **Tool call visualization** — grouped, expandable cards showing tool name, status, inputs, and results as they execute

  <img src="docs/screenshots/tool-calls.png" alt="Tool Call Visualization" width="600">

- **Thinking tokens** — collapsible blocks showing model reasoning with a live thinking indicator
- **Chat history** — sidebar with saved sessions, search, and keyboard shortcut (⌘N) to start a new chat
- **File attachments** — drag-and-drop or click to attach images and documents to messages
- **Config dashboard** — web UI at `/config` to manage providers, models, tools, gateway settings, and plugins without editing JSON

  <img src="docs/screenshots/config.png" alt="Configuration Dashboard" width="600">

## Development

```bash
# Install dependencies
pnpm install

# Run cockpit dev server (requires gateway running)
pnpm dev

# Run tests
pnpm test --filter=cockpit

# Test WebSocket chat from CLI
pnpm openclaw:ws -- "hello, what tools do you have?"
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes* | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key (needed for Claude models) |
| `GOOGLE_API_KEY` | No | — | Google API key (needed for Gemini models) |
| `OPENCLAW_IMAGE` | No | `ghcr.io/openclaw/openclaw:latest` | OpenClaw Docker image |
| `OPENCLAW_GATEWAY_BIND` | No | `lan` | Gateway bind mode |
| `COCKPIT_PORT` | No | `3000` | Cockpit web UI port |
| `OPENCLAW_GATEWAY_PORT` | No | `18789` | Gateway port |

*At least one LLM provider API key is required. Set whichever provider you want to use.
