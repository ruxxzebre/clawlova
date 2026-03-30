FROM node:22-slim AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/cockpit/package.json packages/cockpit/package.json
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
COPY . .
RUN pnpm --filter cockpit build

# Production image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy Nitro output for the cockpit workspace.
COPY --from=builder /app/packages/cockpit/.output /app/.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
