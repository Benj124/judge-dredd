#!/usr/bin/env bash
# Start local Postgres for Judge Dredd. Prefers Docker Compose; falls back to
# Homebrew PostgreSQL 16 on this machine. Does not use AWS/RDS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if docker info >/dev/null 2>&1; then
  echo "Starting Postgres via Docker Compose on localhost:5432"
  docker compose -f "$ROOT/docker-compose.yml" up -d
  echo "Waiting for healthcheck..."
  for _ in $(seq 1 40); do
    if docker compose -f "$ROOT/docker-compose.yml" exec -T postgres pg_isready -U judge -d judge_dredd >/dev/null 2>&1; then
      echo "Postgres is ready (compose)."
      echo "Use DATABASE_URL=postgres://judge:judge@127.0.0.1:5432/judge_dredd"
      exit 0
    fi
    sleep 0.25
  done
  echo "Compose Postgres did not become ready in time." >&2
  exit 1
fi

echo "Docker daemon not running; using local Homebrew PostgreSQL 16."
export PATH="/opt/homebrew/opt/postgresql@16/bin:/usr/local/opt/postgresql@16/bin:${PATH}"
if ! command -v pg_ctl >/dev/null 2>&1; then
  echo "pg_ctl not found. Install PostgreSQL 16 (brew install postgresql@16) or start Docker Desktop." >&2
  exit 1
fi

PGDATA="${PGDATA:-/opt/homebrew/var/postgresql@16}"
if [[ ! -d "$PGDATA" ]]; then
  echo "Postgres data directory not found at $PGDATA" >&2
  exit 1
fi

if pg_isready -q; then
  echo "Postgres already accepting connections on localhost."
else
  mkdir -p /opt/homebrew/var/log
  pg_ctl -D "$PGDATA" -l /opt/homebrew/var/log/judge-dredd-postgres.log start
fi

if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='judge_dredd'" | grep -q 1; then
  createdb judge_dredd
  echo "Created database judge_dredd"
fi

echo "Postgres is ready (homebrew)."
echo "Use DATABASE_URL=postgres://$(whoami)@127.0.0.1:5432/judge_dredd"
