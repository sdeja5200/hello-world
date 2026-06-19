#!/bin/sh
# start.sh — Railway entrypoint for the hello-world service.
#
# Guards against unresolved Railway variable references (e.g. "${{Postgres.DATABASE_URL}}").
# When a Postgres service is redeployed its credentials rotate, and the reference
# can temporarily arrive as a literal template string instead of a real DSN.
# In that case we skip migrations (which would fail with Prisma P1000) and start
# the Node server anyway so the healthcheck at /healthz can pass while the
# variable-reference issue is investigated.

set -e

# Detect an unresolved Railway variable reference: starts with "${{" or contains "}}".
is_unresolved() {
  case "$DATABASE_URL" in
    '${{'{*}*) return 0 ;;   # literal ${{ prefix
    *'}}'*)    return 0 ;;   # contains closing }}
  esac
  return 1
}

if [ -z "$DATABASE_URL" ]; then
  echo "[start] WARNING: DATABASE_URL is not set. Skipping migrations and starting server." >&2
  echo "[start] The app will start but database-dependent routes will fail." >&2
elif is_unresolved; then
  echo "[start] WARNING: DATABASE_URL appears to be an unresolved Railway variable reference:" >&2
  echo "[start]   DATABASE_URL=${DATABASE_URL}" >&2
  echo "[start] This usually means the Postgres service credentials rotated and the" >&2
  echo "[start]   reference has not yet synced. Skipping 'prisma migrate deploy' to" >&2
  echo "[start]   avoid a P1000 authentication error." >&2
  echo "[start] Redeploy this service once the variable reference resolves, or check" >&2
  echo "[start]   the Railway dashboard → Variables tab for this service." >&2
else
  echo "[start] DATABASE_URL looks valid. Running 'prisma migrate deploy'..."
  npx prisma migrate deploy
  echo "[start] Migrations complete."
fi

echo "[start] Starting Node server..."
exec node dist/index.js
