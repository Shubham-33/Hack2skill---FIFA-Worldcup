# syntax=docker/dockerfile:1
#
# Multi-stage build for Cloud Run.
#
# Cloud Run sets $PORT and expects the server to bind 0.0.0.0:$PORT. Next.js standalone
# output honours PORT, so no extra wiring is needed. The final image carries only the
# standalone server and static assets — no full node_modules, no build toolchain.

# ── deps: install with a clean, reproducible lockfile ──────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build: compile the Next.js standalone bundle ───────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── run: minimal runtime image ─────────────────────────────────────────────
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
# Do not run as root.
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# Standalone server, static chunks, and public assets — nothing else.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
# Cloud Run overrides this, but a sensible default keeps local runs simple.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
