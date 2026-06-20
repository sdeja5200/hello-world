# syntax=docker/dockerfile:1

# ---- Build the Vue Custom Page ----
FROM node:22-slim AS ui
WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# ---- Build the TypeScript backend ----
FROM node:22-slim AS build
ENV CHECKPOINT_DISABLE=1
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime image ----
# Use the full node:22 (Debian bookworm) image, NOT -slim. On -slim, Prisma's
# libssl/openssl auto-detection fails and bundles the openssl-1.1.x query
# engine, which cannot load on this OpenSSL-3 system — crashing the app the
# moment `new PrismaClient()` runs, before it can listen. The full image ships
# OpenSSL 3.x properly configured so detection picks debian-openssl-3.0.x.
FROM node:22 AS runtime
ENV NODE_ENV=production
# Prisma's update-checkpoint ping can hang in network-restricted hosts (e.g. Railway),
# stalling the CLI well past the platform's healthcheck timeout. Disable it.
ENV CHECKPOINT_DISABLE=1
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

# Compiled backend + built UI assets.
COPY --from=build /app/dist ./dist
COPY --from=ui /app/ui/dist ./ui/dist

EXPOSE 3000
# Just start the server. Database migrations are run separately via Railway's
# `preDeployCommand` (see railway.json) so they can't stall the healthcheck.
CMD ["node", "dist/index.js"]
