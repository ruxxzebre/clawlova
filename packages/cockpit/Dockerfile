FROM node:22-slim AS base

WORKDIR /app

# Install workspace dependencies from the repo root so npm can resolve
# the cockpit package as part of the workspace.
# COPY package.json package-lock.json ./
COPY package.json ./
COPY packages/cockpit/package.json packages/cockpit/package.json
# RUN npm ci
RUN npm install

# Build
FROM base AS builder
COPY . .
RUN npm run build --workspace=cockpit

# Production image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy Nitro output for the cockpit workspace.
COPY --from=builder /app/packages/cockpit/.output /app/.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
