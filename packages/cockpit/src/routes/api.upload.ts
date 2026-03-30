import { createFileRoute } from '@tanstack/react-router'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { addFile } from '#/lib/file-registry'

const UPLOAD_DIR = process.env['UPLOAD_DIR'] ?? '/openclaw-workspace/uploads'

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/xml',
])

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData()
        const file = formData.get('file')

        if (!file || !(file instanceof File)) {
          return new Response(JSON.stringify({ error: 'No file provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
          return new Response(
            JSON.stringify({ error: `File type not allowed: ${file.type}` }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }

        if (file.size > MAX_FILE_SIZE) {
          return new Response(
            JSON.stringify({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const uuid = crypto.randomUUID()
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const key = `uploads/${uuid}_${safeName}`
        const filePath = join(UPLOAD_DIR, `${uuid}_${safeName}`)

        await mkdir(UPLOAD_DIR, { recursive: true })

        const buffer = Buffer.from(await file.arrayBuffer())
        await writeFile(filePath, buffer)

        await addFile({
          key,
          originalName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString(),
        })

        return new Response(
          JSON.stringify({
            key,
            originalName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
