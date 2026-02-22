#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Astro Installer
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/marksnyder/astro/main/install.sh | bash
#
# With options:
#   curl -fsSL https://raw.githubusercontent.com/marksnyder/astro/main/install.sh | bash -s -- \
#     --port 9000 --ts-authkey tskey-auth-... --ts-hostname my-astro
#
# Environment variables (alternative to flags):
#   PORT              — Host port (default: 8000)
#   ASTRO_DATA_DIR    — Persistent data directory (default: ~/astro-data)
#   TS_AUTHKEY        — Tailscale auth key (required on first run)
#   TS_HOSTNAME       — Tailscale hostname (default: astro)
#   TS_SERVE_HTTPS    — Enable Tailscale HTTPS proxy (default: true)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

IMAGE_NAME="marksnyder/astro"
CONTAINER_NAME="astro"
PORT="${PORT:-8000}"
ASTRO_DATA_DIR="${ASTRO_DATA_DIR:-$HOME/astro-data}"
TS_AUTHKEY="${TS_AUTHKEY:-}"
TS_HOSTNAME="${TS_HOSTNAME:-astro}"
TS_SERVE_HTTPS="${TS_SERVE_HTTPS:-true}"

usage() {
    cat <<USAGE
Usage: install.sh [OPTIONS]

Options:
  --port PORT             Host port to expose (default: 8000)
  --data-dir DIR          Persistent data directory (default: ~/astro-data)
  --ts-authkey KEY        Tailscale auth key (required on first run)
  --ts-hostname NAME      Tailscale hostname (default: astro)
  --ts-serve-https BOOL   Enable Tailscale HTTPS (default: true)
  -h, --help              Show this help message
USAGE
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)           PORT="$2"; shift 2 ;;
        --data-dir)       ASTRO_DATA_DIR="$2"; shift 2 ;;
        --ts-authkey)     TS_AUTHKEY="$2"; shift 2 ;;
        --ts-hostname)    TS_HOSTNAME="$2"; shift 2 ;;
        --ts-serve-https) TS_SERVE_HTTPS="$2"; shift 2 ;;
        -h|--help)        usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

# ── Preflight checks ─────────────────────────────────────────

if ! command -v docker &>/dev/null; then
    echo "Error: Docker is not installed. Install it first: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &>/dev/null; then
    echo "Error: Docker daemon is not running or current user lacks permissions."
    echo "Try: sudo usermod -aG docker \$USER  (then log out and back in)"
    exit 1
fi

echo "============================================"
echo "  Astro Installer"
echo "============================================"
echo ""

# ── Stop and remove existing container ────────────────────────

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "==> Removing existing Astro container..."
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1
fi

# ── Remove old image(s) ──────────────────────────────────────

OLD_IMAGE_ID=$(docker images "${IMAGE_NAME}" -q 2>/dev/null || true)
if [ -n "$OLD_IMAGE_ID" ]; then
    echo "==> Removing old Astro image..."
    docker rmi -f $OLD_IMAGE_ID 2>/dev/null || true
fi

# ── Pull the latest image ────────────────────────────────────

echo "==> Pulling latest Astro image from Docker Hub..."
docker pull "${IMAGE_NAME}:latest"

# ── Create persistent data directories ───────────────────────

echo "==> Setting up data directories at ${ASTRO_DATA_DIR}..."
mkdir -p "${ASTRO_DATA_DIR}/data"
mkdir -p "${ASTRO_DATA_DIR}/documents"
mkdir -p "${ASTRO_DATA_DIR}/tailscale"

# ── Run the container ─────────────────────────────────────────

echo "==> Starting Astro..."
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
echo "============================================"
echo "  Astro is running!"
echo "============================================"
echo ""
echo "  URL:        http://localhost:${PORT}"
echo "  Data dir:   ${ASTRO_DATA_DIR}"
echo "  Container:  ${CONTAINER_NAME}"
echo ""
if [ "${TS_SERVE_HTTPS}" = "true" ]; then
    echo "  Tailscale HTTPS will be available at:"
    echo "    https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
    echo ""
fi
echo "Useful commands:"
echo "  docker logs -f ${CONTAINER_NAME}        # view logs"
echo "  docker exec ${CONTAINER_NAME} tailscale status  # tailscale status"
echo "  docker stop ${CONTAINER_NAME}           # stop"
echo "  docker rm -f ${CONTAINER_NAME}          # remove"
echo ""
echo "To update in the future, just run this installer again."
