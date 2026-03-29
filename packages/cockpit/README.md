# cockpit

The web UI for clawlova — a chat interface that connects to an [OpenClaw](https://openclaw.ai) AI agent instance.

Built with [TanStack Start](https://tanstack.com/start) (React 19 SSR), Tailwind CSS, and TypeScript.

## Routes

| Route | Description |
|-------|-------------|
| `/` | Chat interface with streaming responses, tool call visualization, and session history |
| `/config` | OpenClaw configuration editor (auth profiles, model selection, tools, gateway settings) |
| `/api/chat` | SSE endpoint — bridges browser requests to the OpenClaw gateway via WebSocket |
| `/api/config` | Read/write OpenClaw configuration |
| `/api/models` | Fetch available models from provider APIs |
| `/api/sessions` | List persisted chat sessions |
| `/api/session` | Load messages for a specific session |

## Development

```bash
npm install
npm run dev       # dev server on http://localhost:3000
npm run build     # production build
npm test          # run vitest suite
npm run check     # prettier + eslint fix
```

## Architecture

See the [root README](../../README.md) for the full architecture overview, data flow, and design trade-offs.
