import type { StreamChunk } from '@tanstack/ai'
import type { GatewayResponseFrame } from './types'

export function toWebSocketUrl(value: string): string {
  if (value.startsWith('ws://') || value.startsWith('wss://')) {
    return value
  }
  if (value.startsWith('http://')) {
    return `ws://${value.slice('http://'.length)}`
  }
  if (value.startsWith('https://')) {
    return `wss://${value.slice('https://'.length)}`
  }
  return `ws://${value}`
}

export function toBase64Url(value: Uint8Array | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function asString(value: unknown, key?: string): string | undefined {
  const next = key ? asRecord(value)?.[key] : value
  return typeof next === 'string' ? next : undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

export function stringifyArgs(value: unknown): string {
  if (value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

export function stringifyResult(value: unknown): string {
  if (value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value, null, 2)
}

export function throwGatewayError(
  method: string,
  error?: GatewayResponseFrame['error'],
): never {
  const message = error?.message ?? `${method} failed`
  const code = error?.details?.code ?? error?.code
  if (code) {
    throw new Error(`${method} failed [${code}]: ${message}`)
  }
  throw new Error(`${method} failed: ${message}`)
}

export function toRunError(runId: string, error: unknown): StreamChunk {
  return {
    type: 'RUN_ERROR',
    runId,
    timestamp: Date.now(),
    error: {
      message: error instanceof Error ? error.message : 'Unknown OpenClaw error',
    },
  }
}

export function normalizeFinishReason(
  finishReason?: string | null,
): 'stop' | 'length' | 'content_filter' | 'tool_calls' | null {
  if (finishReason === 'stop') return 'stop'
  if (finishReason === 'length') return 'length'
  if (finishReason === 'content_filter') return 'content_filter'
  if (finishReason === 'tool_calls') return 'tool_calls'
  return 'stop'
}
