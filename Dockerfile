# syntax=docker/dockerfile:1
#
# Production image for the BRS Tee-Time Sniper (Next.js standalone output).
# Multi-stage: install deps -> build -> minimal runtime.
# Built and run by Coolify — see docs/DEPLOY.md.

# ---- Dependencies ------------------------------------------------------------
FROM node:24-alpine AS deps
# libc6-compat is commonly needed for native modules on Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Builder -----------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Produces .next/standalone thanks to `output: 'standalone'` in next.config.ts.
# NOTE (Phase 1): once prisma/schema.prisma has models, add a `npx prisma generate`
# step here (and `prisma migrate deploy` to the Coolify release command).
RUN npm run build

# ---- Runner ------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Run as an unprivileged user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# The standalone server does not bundle public/ or .next/static — copy them in.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
