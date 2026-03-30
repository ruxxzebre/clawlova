import { createFileRoute } from '@tanstack/react-router'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const UPLOAD_DIR = process.env['UPLOAD_DIR'] ?? '/openclaw-workspace/uploads'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.xml': 'application/xml',
}

export const Route = createFileRoute('/api/file')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const key = url.searchParams.get('key')

        if (!key || !key.startsWith('uploads/')) {
          return new Response('Bad request', { status: 400 })
        }

        // Prevent path traversal
        const filename = key.replace(/^uploads\//, '')
        if (filename.includes('..') || filename.includes('/')) {
          return new Response('Bad request', { status: 400 })
        }

        const filePath = join(UPLOAD_DIR, filename)

        try {
          const [buffer, info] = await Promise.all([
            readFile(filePath),
            stat(filePath),
          ])

          const ext = '.' + filename.split('.').pop()?.toLowerCase()
          const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(info.size),
              'Cache-Control': 'private, max-age=86400',
            },
          })
        } catch {
          return new Response('Not found', { status: 404 })
        }
      },
    },
  },
})
