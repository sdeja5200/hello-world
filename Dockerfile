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
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Lean runtime image ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# OpenSSL is required by Prisma's query engine.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

# Compiled backend + built UI assets.
COPY --from=build /app/dist ./dist
COPY --from=ui /app/ui/dist ./ui/dist

# Entrypoint script — validates DATABASE_URL before running migrations.
COPY scripts/start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 3000
# start.sh validates DATABASE_URL, skips migrations if the Railway variable
# reference hasn't resolved yet, then starts the Node server.
CMD ["./start.sh"]
