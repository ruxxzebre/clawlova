#!/bin/sh

set -eu

CONFIG_ROOT="${OPENCLAW_CONFIG_ROOT:-/home/node/.openclaw}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-/home/node/.openclaw/workspace}"
TOKEN_FILE="${OPENCLAW_BOOTSTRAP_TOKEN_FILE:-${CONFIG_ROOT}/.gateway-token}"
GATEWAY_BIND="${OPENCLAW_GATEWAY_BIND:-lan}"
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
MODEL_PROVIDER="${OPENCLAW_MODEL_PROVIDER:-openai}"
MODEL_NAME="${OPENCLAW_MODEL_NAME:-gpt-5.4}"
OPENCLAW_UID="${OPENCLAW_UID:-1000}"
OPENCLAW_GID="${OPENCLAW_GID:-1000}"

log() {
  printf '%s\n' "$*"
}

ensure_directories() {
  mkdir -p "${CONFIG_ROOT}" "${WORKSPACE_DIR}" "$(dirname "${TOKEN_FILE}")"
}

ensure_ownership() {
  chown -R "${OPENCLAW_UID}:${OPENCLAW_GID}" "${CONFIG_ROOT}" "${WORKSPACE_DIR}"
}

ensure_openai_key() {
  if [ "${MODEL_PROVIDER}" = "openai" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
    log "init: OPENAI_API_KEY is required when OPENCLAW_MODEL_PROVIDER=openai"
    exit 1
  fi
}

ensure_gateway_token() {
  if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
    printf '%s\n' "${OPENCLAW_GATEWAY_TOKEN}" >"${TOKEN_FILE}"
    return 0
  fi

  if [ -f "${TOKEN_FILE}" ]; then
    OPENCLAW_GATEWAY_TOKEN="$(tr -d '\n' <"${TOKEN_FILE}")"
    export OPENCLAW_GATEWAY_TOKEN
    return 0
  fi

  OPENCLAW_GATEWAY_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")"
  export OPENCLAW_GATEWAY_TOKEN
  printf '%s\n' "${OPENCLAW_GATEWAY_TOKEN}" >"${TOKEN_FILE}"
}

ensure_config() {
  if [ -f "${CONFIG_ROOT}/openclaw.json" ]; then
    return 0
  fi

  log "init: writing ${CONFIG_ROOT}/openclaw.json"
  node -e "
    const fs = require('node:fs');
    const path = require('node:path');
    const configRoot = process.argv[1];
    const workspaceDir = process.argv[2];
    const gatewayToken = process.argv[3];
    const gatewayBind = process.argv[4];
    const gatewayPort = Number(process.argv[5]);
    const modelProvider = process.argv[6];
    const modelName = process.argv[7];
    const modelId = \`\${modelProvider}/\${modelName}\`;
    const config = {
      auth: {
        profiles: {
          [\`\${modelProvider}:default\`]: {
            provider: modelProvider,
            mode: 'api_key',
          },
        },
      },
      agents: {
        defaults: {
          model: { primary: modelId },
          models: { [modelId]: { alias: 'Default' } },
          workspace: workspaceDir,
        },
      },
      tools: {
        profile: 'coding',
        web: {
          search: {
            enabled: true,
            provider: 'duckduckgo',
          },
        },
      },
      commands: {
        native: 'auto',
        nativeSkills: 'auto',
        restart: true,
        ownerDisplay: 'raw',
      },
      session: {
        dmScope: 'per-channel-peer',
      },
      hooks: {
        internal: {
          enabled: true,
          entries: {
            'command-logger': { enabled: true },
            'session-memory': { enabled: true },
          },
        },
      },
      gateway: {
        port: gatewayPort,
        mode: 'local',
        bind: gatewayBind,
        auth: {
          mode: 'token',
          token: gatewayToken,
        },
        http: {
          endpoints: {
            chatCompletions: { enabled: true },
          },
        },
        controlUi: {
          allowedOrigins: [
            'http://localhost:18789',
            'http://127.0.0.1:18789',
          ],
        },
        tailscale: {
          mode: 'off',
          resetOnExit: false,
        },
        nodes: {
          denyCommands: [
            'camera.snap',
            'camera.clip',
            'screen.record',
            'contacts.add',
            'calendar.add',
            'reminders.add',
            'sms.send',
          ],
        },
      },
      plugins: {
        entries: {
          duckduckgo: { enabled: true },
        },
      },
    };
    fs.mkdirSync(configRoot, { recursive: true });
    fs.writeFileSync(
      path.join(configRoot, 'openclaw.json'),
      JSON.stringify(config, null, 2) + '\n',
      'utf8',
    );
  " "${CONFIG_ROOT}" "${WORKSPACE_DIR}" "${OPENCLAW_GATEWAY_TOKEN}" "${GATEWAY_BIND}" "${GATEWAY_PORT}" "${MODEL_PROVIDER}" "${MODEL_NAME}"
}

ensure_directories
ensure_openai_key
ensure_gateway_token
ensure_config
ensure_ownership

log "init: bootstrap state ready"
