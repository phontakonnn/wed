# syntax=docker/dockerfile:1

# -------------------------------------------------------------
# Stage 1: Build Web Frontend (Vite + React)
# -------------------------------------------------------------
FROM node:22-bookworm-slim AS web-builder
WORKDIR /app/apps/web

COPY apps/web/package*.json ./
RUN npm ci

COPY apps/web/ ./
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Build Server Backend (Fastify + TypeScript)
# -------------------------------------------------------------
FROM node:22-bookworm-slim AS server-builder
WORKDIR /app

# Install native dependencies required for compiling better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY apps/server/package*.json ./apps/server/

WORKDIR /app/apps/server
RUN npm ci

COPY apps/server/ ./
RUN npm run build

# Prune devDependencies to keep image lean
RUN npm prune --production

# -------------------------------------------------------------
# Stage 3: Production Runner
# -------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

LABEL maintainer="PKH / Life OS Team"
LABEL description="PKH / Life OS - Fastify + SQLite + React"

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create persistent data directory and app user for security
RUN mkdir -p /data && chown -R node:node /data

# Copy built server assets and production node_modules
COPY --from=server-builder --chown=node:node /app/apps/server/dist ./dist
COPY --from=server-builder --chown=node:node /app/apps/server/migrations ./migrations
COPY --from=server-builder --chown=node:node /app/apps/server/node_modules ./node_modules
COPY --from=server-builder --chown=node:node /app/apps/server/package.json ./package.json

# Copy built web static assets
COPY --from=web-builder --chown=node:node /app/apps/web/dist ./web-dist

# Switch to non-root user
USER node

EXPOSE 3001

# Healthcheck probe against Fastify /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/api/health || exit 1

VOLUME ["/data"]

CMD ["node", "dist/index.js"]
