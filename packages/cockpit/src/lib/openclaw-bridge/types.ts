import type { StreamChunk } from '@tanstack/ai'

export interface SessionBridgeOptions {
  message: string
  sessionKey: string
  abortSignal?: AbortSignal
}

export interface DeviceIdentity {
  id: string
  publicKey: string
  privateKey: string
}

export interface PendingToolCall {
  name: string
  argsText: string
  input?: unknown
}

export interface BridgeConfig {
  gatewayUrl: string
  deviceFile: string
  deviceTokenFile: string
  bootstrapGatewayToken: string | null
  bootstrapTokenFile: string | null
}

export interface BridgeAuthState {
  deviceIdentity: DeviceIdentity
  cachedDeviceToken: string | null
  connectToken: string
  mode: 'device-token' | 'bootstrap-token'
}

export interface GatewayState {
  runId: string
  messageId: string
  startedAt: number
  sessionKey: string
  prompt: string
  auth: BridgeAuthState
  deviceTokenFile: string
  pendingToolCalls: Map<string, PendingToolCall>
  textStarted: boolean
  textContent: string
}

export interface GatewayResponseFrame {
  type: 'res'
  id: string
  ok: boolean
  payload?: Record<string, unknown>
  error?: {
    message?: string
    code?: string
    details?: {
      code?: string
    }
  }
}

export interface GatewayEventFrame {
  type: 'event'
  event: string
  payload?: Record<string, unknown>
}

export type GatewayFrame = GatewayResponseFrame | GatewayEventFrame

export interface TranslationResult {
  chunks: StreamChunk[]
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  done?: boolean
}
