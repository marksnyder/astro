#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# build.sh — Build the Astro Docker image locally (for development).
#
# Builds the web frontend and creates a local Docker image.
# For production, images are published to Docker Hub via CI.
#
# Usage:  ./deploy/build.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE_NAME="${DOCKER_IMAGE:-marksnyder/astro}"

cd "$PROJECT_ROOT"

echo "==> Building web frontend..."
(cd web && npm install && npm run build)

echo "==> Removing prior astro images..."
docker ps -a --filter "ancestor=${IMAGE_NAME}" -q | xargs -r docker rm -f 2>/dev/null || true
docker images "${IMAGE_NAME}" -q | xargs -r docker rmi -f 2>/dev/null || true
docker image prune -f 2>/dev/null || true

echo "==> Building Docker image: ${IMAGE_NAME}:latest"
docker build \
    -f deploy/Dockerfile \
    -t "${IMAGE_NAME}:latest" \
    .

echo ""
echo "Done!  Image: ${IMAGE_NAME}:latest"
echo "Run with:  ./deploy/run.sh"
