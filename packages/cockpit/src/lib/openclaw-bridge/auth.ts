import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  sign as signMessage,
} from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type {
  BridgeAuthState,
  BridgeConfig,
  DeviceIdentity,
} from './types'
import { toBase64Url } from './utils'

const PAIRING_REQUIRED_CODE = 'PAIRING_REQUIRED'

export async function loadBridgeAuthState(config: BridgeConfig): Promise<BridgeAuthState> {
  const deviceIdentity = await loadOrCreateDeviceIdentity(config.deviceFile)
  const cachedDeviceToken = await loadDeviceToken(config.deviceTokenFile)
  const bootstrapGatewayToken =
    config.bootstrapGatewayToken ??
    (config.bootstrapTokenFile
      ? await loadOptionalToken(config.bootstrapTokenFile)
      : null)
  const mode = resolveAuthMode({
    cachedDeviceToken,
    bootstrapGatewayToken,
  })

  return {
    deviceIdentity,
    cachedDeviceToken,
    connectToken:
      mode === 'device-token'
        ? (cachedDeviceToken as string)
        : (bootstrapGatewayToken as string),
    mode,
  }
}

export function resolveAuthMode(options: {
  cachedDeviceToken: string | null
  bootstrapGatewayToken: string | null
}): BridgeAuthState['mode'] {
  if (options.cachedDeviceToken) {
    return 'device-token'
  }

  if (options.bootstrapGatewayToken) {
    return 'bootstrap-token'
  }

  throw new Error(
    'Cockpit device auth is not configured: provide a persisted device token or a bootstrap token via OPENCLAW_GATEWAY_TOKEN or OPENCLAW_BOOTSTRAP_TOKEN_FILE.',
  )
}

export function handleConnectError(
  error: { message?: string; code?: string; details?: { code?: string } } | undefined,
  mode: BridgeAuthState['mode'],
): never {
  const code = error?.details?.code ?? error?.code
  if (code === PAIRING_REQUIRED_CODE && mode === 'bootstrap-token') {
    throw new Error(
      'Cockpit device bootstrap did not finish before chat traffic started. Check `docker compose logs openclaw-init cockpit-bootstrap openclaw-gateway` and retry once initialization completes.',
    )
  }

  const message = error?.message ?? 'connect failed'
  if (code) {
    throw new Error(`connect failed [${code}]: ${message}`)
  }
  throw new Error(`connect failed: ${message}`)
}

export function signChallenge(options: {
  deviceIdentity: DeviceIdentity
  nonce: string
  ts: number
  clientId: string
  clientMode: string
  role: string
  scopes: Array<string>
  token: string
}): Record<string, unknown> {
  const payload = [
    'v2',
    options.deviceIdentity.id,
    options.clientId,
    options.clientMode,
    options.role,
    options.scopes.join(','),
    String(options.ts),
    options.token,
    options.nonce,
  ].join('|')

  const privateKey = createPrivateKey(options.deviceIdentity.privateKey)
  const signature = signMessage(null, Buffer.from(payload), privateKey)

  return {
    id: options.deviceIdentity.id,
    publicKey: options.deviceIdentity.publicKey,
    signature: toBase64Url(signature),
    signedAt: options.ts,
    nonce: options.nonce,
  }
}

export async function persistDeviceToken(
  deviceTokenFile: string,
  token: string,
): Promise<void> {
  await fs.mkdir(path.dirname(deviceTokenFile), { recursive: true })
  await fs.writeFile(deviceTokenFile, `${token.trim()}\n`, 'utf8')
}

async function loadOrCreateDeviceIdentity(
  deviceFile: string,
): Promise<DeviceIdentity> {
  const envIdentity = process.env['OPENCLAW_DEVICE_IDENTITY']
  if (envIdentity) {
    return JSON.parse(envIdentity) as DeviceIdentity
  }

  try {
    const existing = await fs.readFile(deviceFile, 'utf8')
    return JSON.parse(existing) as DeviceIdentity
  } catch {}

  await fs.mkdir(path.dirname(deviceFile), { recursive: true })

  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwk = publicKey.export({ format: 'jwk' })
  if (!jwk.x) {
    throw new Error('Failed to export OpenClaw device public key')
  }
  const publicKeyRaw = Buffer.from(jwk.x, 'base64url')
  const identity: DeviceIdentity = {
    id: createHash('sha256').update(publicKeyRaw).digest('hex'),
    publicKey: toBase64Url(publicKeyRaw),
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  }

  await fs.writeFile(deviceFile, `${JSON.stringify(identity, null, 2)}\n`, 'utf8')
  return identity
}

async function loadDeviceToken(deviceTokenFile: string): Promise<string | null> {
  const envToken = process.env['OPENCLAW_DEVICE_TOKEN']?.trim()
  if (envToken) {
    return envToken
  }

  try {
    const token = await fs.readFile(deviceTokenFile, 'utf8')
    return token.trim() || null
  } catch {
    return null
  }
}

async function loadOptionalToken(tokenFile: string): Promise<string | null> {
  try {
    const token = await fs.readFile(tokenFile, 'utf8')
    return token.trim() || null
  } catch {
    return null
  }
}
