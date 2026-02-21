#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# run.sh — Run the Astro container with Tailscale networking.
#
# Mounts data/ and documents/ from a persistent host directory
# so they survive image rebuilds. Defaults to ~/astro-data on
# the host; override with ASTRO_DATA_DIR env var.
#
# Tailscale state is persisted in ASTRO_DATA_DIR/tailscale so
# the node stays authenticated across container restarts.
#
# Usage:
#   TS_AUTHKEY=tskey-auth-... ./deploy/run.sh        # first run
#   ./deploy/run.sh                                   # subsequent runs
#   PORT=9000 ./deploy/run.sh                         # custom port
#   TS_HOSTNAME=my-astro ./deploy/run.sh              # custom TS name
#   TS_SERVE_HTTPS=false ./deploy/run.sh              # disable HTTPS
#   ASTRO_DATA_DIR=/mnt/astro ./deploy/run.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

IMAGE_NAME="${DOCKER_IMAGE:-marksnyder/astro}"
CONTAINER_NAME="astro"
PORT="${PORT:-8000}"
ASTRO_DATA_DIR="${ASTRO_DATA_DIR:-$HOME/astro-data}"
TS_AUTHKEY="${TS_AUTHKEY:-}"
TS_HOSTNAME="${TS_HOSTNAME:-astro}"
TS_SERVE_HTTPS="${TS_SERVE_HTTPS:-true}"

mkdir -p "${ASTRO_DATA_DIR}/data"
mkdir -p "${ASTRO_DATA_DIR}/documents"
mkdir -p "${ASTRO_DATA_DIR}/tailscale"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "==> Stopping existing container: ${CONTAINER_NAME}"
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1
fi

echo "==> Starting Astro container"
echo "    Image:      ${IMAGE_NAME}:latest"
echo "    Port:       ${PORT}"
echo "    Data dir:   ${ASTRO_DATA_DIR}/data"
echo "    Docs dir:   ${ASTRO_DATA_DIR}/documents"
echo "    Tailscale:  hostname=${TS_HOSTNAME}, https=${TS_SERVE_HTTPS}"

docker run -d \
    --name "${CONTAINER_NAME}" \
    --restart unless-stopped \
    --cap-add=NET_ADMIN \
    --cap-add=NET_RAW \
    --device /dev/net/tun:/dev/net/tun \
    -p "${PORT}:8000" \
    -e TS_AUTHKEY="${TS_AUTHKEY}" \
    -e TS_HOSTNAME="${TS_HOSTNAME}" \
    -e TS_SERVE_HTTPS="${TS_SERVE_HTTPS}" \
    -v "${ASTRO_DATA_DIR}/data:/app/data" \
    -v "${ASTRO_DATA_DIR}/documents:/app/documents" \
    -v "${ASTRO_DATA_DIR}/tailscale:/var/lib/tailscale" \
    "${IMAGE_NAME}:latest"

echo ""
echo "Astro is running at http://localhost:${PORT}"
if [ "${TS_SERVE_HTTPS}" = "true" ]; then
    echo "HTTPS will be available at https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
fi
echo "Tailscale: docker exec ${CONTAINER_NAME} tailscale status"
echo "Logs: docker logs -f ${CONTAINER_NAME}"
