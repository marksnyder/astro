#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# run.sh — Run the Astro container (with optional Tailscale).
#
# Mounts data/ and documents/ from a persistent host directory
# so they survive image rebuilds. Defaults to ~/astro-data on
# the host; override with ASTRO_DATA_DIR env var.
#
# Usage:
#   ./deploy/run.sh                                   # prompts for Tailscale
#   ./deploy/run.sh --no-tailscale                    # skip Tailscale
#   TS_AUTHKEY=tskey-auth-... ./deploy/run.sh         # enable with key
#   PORT=9000 ./deploy/run.sh                         # custom port
#   TS_HOSTNAME=my-astro ./deploy/run.sh              # custom TS name
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
USE_TAILSCALE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --tailscale)    USE_TAILSCALE="yes"; shift ;;
        --no-tailscale) USE_TAILSCALE="no"; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# If TS_AUTHKEY is set via env, assume Tailscale is wanted
if [ -z "$USE_TAILSCALE" ] && [ -n "$TS_AUTHKEY" ]; then
    USE_TAILSCALE="yes"
fi

# Interactive prompt if not decided yet
if [ -z "$USE_TAILSCALE" ]; then
    if [ -t 0 ]; then
        read -rp "Enable Tailscale networking? [y/N] " ts_answer
        case "$ts_answer" in
            [Yy]*) USE_TAILSCALE="yes" ;;
            *)     USE_TAILSCALE="no" ;;
        esac
    else
        USE_TAILSCALE="no"
    fi
fi

mkdir -p "${ASTRO_DATA_DIR}/data"
mkdir -p "${ASTRO_DATA_DIR}/documents"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "==> Stopping existing container: ${CONTAINER_NAME}"
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1
fi

echo "==> Starting Astro container"
echo "    Image:      ${IMAGE_NAME}:latest"
echo "    Port:       ${PORT}"
echo "    Data dir:   ${ASTRO_DATA_DIR}/data"
echo "    Docs dir:   ${ASTRO_DATA_DIR}/documents"
echo "    Tailscale:  ${USE_TAILSCALE}"

DOCKER_ARGS=(
    -d
    --name "${CONTAINER_NAME}"
    --restart unless-stopped
    -p "${PORT}:8000"
    -v "${ASTRO_DATA_DIR}/data:/app/data"
    -v "${ASTRO_DATA_DIR}/documents:/app/documents"
)

if [ "$USE_TAILSCALE" = "yes" ]; then
    mkdir -p "${ASTRO_DATA_DIR}/tailscale"
    DOCKER_ARGS+=(
        --cap-add=NET_ADMIN
        --cap-add=NET_RAW
        --device /dev/net/tun:/dev/net/tun
        -e TS_AUTHKEY="${TS_AUTHKEY}"
        -e TS_HOSTNAME="${TS_HOSTNAME}"
        -e TS_SERVE_HTTPS="${TS_SERVE_HTTPS}"
        -v "${ASTRO_DATA_DIR}/tailscale:/var/lib/tailscale"
    )
fi

docker run "${DOCKER_ARGS[@]}" "${IMAGE_NAME}:latest"

echo ""
echo "Astro is running at http://localhost:${PORT}"
if [ "$USE_TAILSCALE" = "yes" ]; then
    if [ "${TS_SERVE_HTTPS}" = "true" ]; then
        echo "HTTPS will be available at https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
    fi
    echo "Tailscale: docker exec ${CONTAINER_NAME} tailscale status"
fi
echo "Logs: docker logs -f ${CONTAINER_NAME}"
