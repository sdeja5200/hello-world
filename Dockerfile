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

# ---- Lean runtime image ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
# Prisma's update-checkpoint ping can hang in network-restricted hosts (e.g. Railway),
# stalling the CLI well past the platform's healthcheck timeout. Disable it.
ENV CHECKPOINT_DISABLE=1
WORKDIR /app

# OpenSSL is required by Prisma's query engine.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

# Compiled backend + built UI assets.
COPY --from=build /app/dist ./dist
COPY --from=ui /app/ui/dist ./ui/dist

EXPOSE 3000
# Apply pending migrations, then start. `migrate deploy` is safe/idempotent.
# Call the local binary directly (skip npx's own resolution/network checks) and
# exec into node so it replaces the shell as PID 1 and receives signals correctly.
CMD ["sh", "-c", "echo '[start] running migrations...' && ./node_modules/.bin/prisma migrate deploy && echo '[start] migrations done, starting server...' && exec node dist/index.js"]
