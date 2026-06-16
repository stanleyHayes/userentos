# RentOS Server — Production Docker Image
# Multi-stage build for minimal runtime footprint

# ─── Stage 1: Builder ───
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (better layer caching)
COPY server/package.json server/package-lock.json ./
# Full install (incl. devDeps) — tsc/tsx are required to build
RUN npm ci --ignore-scripts

# Copy source and build
COPY shared/ ../shared/
COPY server/ ./
RUN npm run build

# Drop devDependencies so the runtime stage copies a lean node_modules
RUN npm prune --omit=dev

# ─── Stage 2: Runtime ───
FROM node:22-alpine AS runtime

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S rentos && adduser -S rentos -u 1001

# Copy compiled output and production dependencies
COPY --from=builder --chown=rentos:rentos /app/dist ./dist
COPY --from=builder --chown=rentos:rentos /app/node_modules ./node_modules
COPY --from=builder --chown=rentos:rentos /app/package.json ./package.json

# Uploads directory (persistent volume recommended)
RUN mkdir -p /app/uploads && chown -R rentos:rentos /app/uploads

USER rentos

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "dist/index.js"]
