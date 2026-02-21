#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# stop.sh — Stop the Astro container.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

CONTAINER_NAME="astro"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "==> Stopping ${CONTAINER_NAME}..."
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1
    echo "Stopped."
else
    echo "No running container named ${CONTAINER_NAME}."
fi
