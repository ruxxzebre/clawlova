import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [configRoot, workspaceDir, gatewayToken, gatewayBind, gatewayPortStr, modelProvider, modelName] = process.argv.slice(2);

if (!configRoot || !workspaceDir || !gatewayToken || !gatewayBind || !gatewayPortStr || !modelProvider || !modelName) {
  console.error('Usage: node openclaw-write-config.mjs <configRoot> <workspaceDir> <gatewayToken> <gatewayBind> <gatewayPort> <modelProvider> <modelName>');
  process.exit(1);
}

const gatewayPort = Number(gatewayPortStr);
const modelId = `${modelProvider}/${modelName}`;

const config = {
  auth: {
    profiles: {
      [`${modelProvider}:default`]: {
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

mkdirSync(configRoot, { recursive: true });
writeFileSync(
  join(configRoot, 'openclaw.json'),
  JSON.stringify(config, null, 2) + '\n',
  'utf8',
);
