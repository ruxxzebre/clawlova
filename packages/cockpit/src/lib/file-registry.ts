import { readFile, writeFile, rename } from 'node:fs/promises'
import { join, dirname } from 'node:path'

export interface FileRecord {
  key: string
  originalName: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
  sessionKey?: string
}

const REGISTRY_PATH =
  process.env['FILE_REGISTRY_PATH'] ??
  '/var/lib/cockpit/file-registry.json'

async function readRegistry(): Promise<FileRecord[]> {
  try {
    const data = await readFile(REGISTRY_PATH, 'utf-8')
    return JSON.parse(data) as FileRecord[]
  } catch {
    return []
  }
}

async function writeRegistry(records: FileRecord[]): Promise<void> {
  const tmpPath = join(dirname(REGISTRY_PATH), `.file-registry-${Date.now()}.tmp`)
  await writeFile(tmpPath, JSON.stringify(records, null, 2), 'utf-8')
  await rename(tmpPath, REGISTRY_PATH)
}

export async function addFile(record: FileRecord): Promise<void> {
  const records = await readRegistry()
  records.push(record)
  await writeRegistry(records)
}

export async function getFile(key: string): Promise<FileRecord | null> {
  const records = await readRegistry()
  return records.find((r) => r.key === key) ?? null
}

export async function listFiles(sessionKey?: string): Promise<FileRecord[]> {
  const records = await readRegistry()
  if (!sessionKey) return records
  return records.filter((r) => r.sessionKey === sessionKey)
}
