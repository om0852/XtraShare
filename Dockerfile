# ===================================================
# Stage 1: Build Protocol, Web & Server
# ===================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/desktop-agent/package.json ./apps/desktop-agent/

# Install all dependencies
RUN npm ci

# Copy all source files
COPY packages/protocol ./packages/protocol
COPY apps/server ./apps/server
COPY apps/web ./apps/web
COPY apps/desktop-agent ./apps/desktop-agent

# Build all packages & apps
RUN npm run build --workspaces

# ===================================================
# Stage 2: Minimal Production Runtime
# ===================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy root package and package-lock
COPY package.json package-lock.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY apps/server/package.json ./apps/server/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=@xtrashare/server --workspace=@xtrashare/protocol

# Copy compiled protocol and server artifacts
COPY --from=builder /app/packages/protocol/dist ./packages/protocol/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Copy compiled Web PWA dist for static serving by Express
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Run as non-root node user for security
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -k -f https://localhost:3000/api/health || curl -f http://localhost:3000/api/health || exit 1

WORKDIR /app/apps/server
CMD ["node", "dist/index.js"]
