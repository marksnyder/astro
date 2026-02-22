#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Astro Installer
#
# One-liner (interactive — prompts for Tailscale):
#   curl -fsSL https://raw.githubusercontent.com/marksnyder/astro/main/install.sh | bash
#
# Non-interactive / with options:
#   curl -fsSL ... | bash -s -- --no-tailscale
#   curl -fsSL ... | bash -s -- --ts-authkey tskey-auth-...
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
USE_TAILSCALE=""

usage() {
    cat <<USAGE
Usage: install.sh [OPTIONS]

Options:
  --port PORT             Host port to expose (default: 8000)
  --data-dir DIR          Persistent data directory (default: ~/astro-data)
  --tailscale             Enable Tailscale (will prompt for auth key)
  --no-tailscale          Disable Tailscale
  --ts-authkey KEY        Tailscale auth key (implies --tailscale)
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
        --tailscale)      USE_TAILSCALE="yes"; shift ;;
        --no-tailscale)   USE_TAILSCALE="no"; shift ;;
        --ts-authkey)     TS_AUTHKEY="$2"; USE_TAILSCALE="yes"; shift 2 ;;
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

# ── Tailscale prompt ─────────────────────────────────────────
# If the user didn't pass --tailscale / --no-tailscale / --ts-authkey,
# prompt interactively (falls back to "no" when stdin isn't a tty).

if [ -z "$USE_TAILSCALE" ]; then
    if [ -t 0 ]; then
        TTY_IN=/dev/stdin
    elif [ -e /dev/tty ]; then
        TTY_IN=/dev/tty
    else
        TTY_IN=""
    fi

    if [ -n "$TTY_IN" ]; then
        read -rp "Enable Tailscale networking? [y/N] " ts_answer < "$TTY_IN"
        case "$ts_answer" in
            [Yy]*) USE_TAILSCALE="yes" ;;
            *)     USE_TAILSCALE="no" ;;
        esac
    else
        echo "==> Non-interactive mode detected. Skipping Tailscale."
        echo "    Pass --tailscale or --ts-authkey to enable it."
        USE_TAILSCALE="no"
    fi
fi

if [ "$USE_TAILSCALE" = "yes" ]; then
    HAS_TS_STATE=false
    if [ -d "${ASTRO_DATA_DIR}/tailscale" ] && [ -f "${ASTRO_DATA_DIR}/tailscale/tailscaled.state" ]; then
        HAS_TS_STATE=true
    fi

    if [ -z "$TS_AUTHKEY" ]; then
        if [ "$HAS_TS_STATE" = true ]; then
            echo "==> Found existing Tailscale state — will reconnect automatically."
        else
            if [ -t 0 ]; then
                TTY_IN=/dev/stdin
            elif [ -e /dev/tty ]; then
                TTY_IN=/dev/tty
            else
                TTY_IN=""
            fi

            if [ -n "$TTY_IN" ]; then
                read -rp "Tailscale auth key (tskey-auth-...): " TS_AUTHKEY < "$TTY_IN"
                if [ -z "$TS_AUTHKEY" ]; then
                    echo "Warning: No auth key provided and no existing state found. Tailscale may not connect."
                fi
                read -rp "Tailscale hostname [${TS_HOSTNAME}]: " ts_hn < "$TTY_IN"
                if [ -n "$ts_hn" ]; then
                    TS_HOSTNAME="$ts_hn"
                fi
            fi
        fi
    fi
fi

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

# ── Run the container ─────────────────────────────────────────

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
        -e TS_ENABLED=true
        -e TS_AUTHKEY="${TS_AUTHKEY}"
        -e TS_HOSTNAME="${TS_HOSTNAME}"
        -e TS_SERVE_HTTPS="${TS_SERVE_HTTPS}"
        -v "${ASTRO_DATA_DIR}/tailscale:/var/lib/tailscale"
    )
fi

echo "==> Starting Astro..."
docker run "${DOCKER_ARGS[@]}" "${IMAGE_NAME}:latest"

echo ""
echo "============================================"
echo "  Astro is running!"
echo "============================================"
echo ""
echo "  URL:        http://localhost:${PORT}"
echo "  Data dir:   ${ASTRO_DATA_DIR}"
echo "  Container:  ${CONTAINER_NAME}"
echo ""
if [ "$USE_TAILSCALE" = "yes" ]; then
    echo "  Tailscale:  enabled (hostname: ${TS_HOSTNAME})"
    if [ "${TS_SERVE_HTTPS}" = "true" ]; then
        echo "  HTTPS:      https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
    fi
    echo ""
fi
echo "Useful commands:"
echo "  docker logs -f ${CONTAINER_NAME}        # view logs"
if [ "$USE_TAILSCALE" = "yes" ]; then
    echo "  docker exec ${CONTAINER_NAME} tailscale status  # tailscale status"
fi
echo "  docker stop ${CONTAINER_NAME}           # stop"
echo "  docker rm -f ${CONTAINER_NAME}          # remove"
echo ""
echo "To update in the future, just run this installer again."
