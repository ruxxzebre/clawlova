import type { BridgeConfig } from './types'

const DEFAULT_GATEWAY_URL = 'http://localhost:18789'
const DEFAULT_DEVICE_FILE = '/var/lib/cockpit/openclaw-device.json'
const DEFAULT_DEVICE_TOKEN_FILE = '/var/lib/cockpit/openclaw-device-token'

export const DEFAULT_SCOPES = ['operator.read', 'operator.write']

export function getBridgeConfig(): BridgeConfig {
  return {
    gatewayUrl: process.env['OPENCLAW_GATEWAY_URL'] ?? DEFAULT_GATEWAY_URL,
    bootstrapGatewayToken: readEnvValue('OPENCLAW_GATEWAY_TOKEN'),
    bootstrapTokenFile: readEnvValue('OPENCLAW_BOOTSTRAP_TOKEN_FILE'),
    deviceFile: process.env['OPENCLAW_DEVICE_FILE'] ?? DEFAULT_DEVICE_FILE,
    deviceTokenFile:
      process.env['OPENCLAW_DEVICE_TOKEN_FILE'] ?? DEFAULT_DEVICE_TOKEN_FILE,
  }
}

function readEnvValue(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}
