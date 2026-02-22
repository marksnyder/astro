#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# entrypoint.sh — Start Tailscale, then launch the Astro app.
#
# Environment variables:
#   TS_AUTHKEY     — Tailscale auth key (required on first run)
#   TS_ENABLED     — Set to "true" to start Tailscale even without an auth key
#   TS_HOSTNAME    — Tailscale hostname (default: "astro")
#   TS_SERVE_HTTPS — Set to "true" to enable Tailscale HTTPS (default: true)
#   TS_EXTRA_ARGS  — Extra args passed to `tailscale up`
# ──────────────────────────────────────────────────────────────
set -euo pipefail

TS_HOSTNAME="${TS_HOSTNAME:-astro}"
TS_SERVE_HTTPS="${TS_SERVE_HTTPS:-true}"
TS_ENABLED="${TS_ENABLED:-}"
TS_OK=false

HAS_STATE=false
if [ -f /var/lib/tailscale/tailscaled.state ]; then
    HAS_STATE=true
fi

# Start Tailscale if we have an auth key, persisted state, or TS_ENABLED=true
if [ -n "${TS_AUTHKEY:-}" ] || [ "$HAS_STATE" = true ] || [ "${TS_ENABLED:-}" = "true" ]; then
    echo "==> Starting tailscaled..."
    tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &
    sleep 2

    TS_UP_ARGS=(--hostname="${TS_HOSTNAME}")

    if [ -n "${TS_AUTHKEY:-}" ]; then
        TS_UP_ARGS+=(--authkey="${TS_AUTHKEY}")
    fi

    if [ -n "${TS_EXTRA_ARGS:-}" ]; then
        # shellcheck disable=SC2206
        TS_UP_ARGS+=(${TS_EXTRA_ARGS})
    fi

    if [ "$HAS_STATE" = true ] && [ -z "${TS_AUTHKEY:-}" ]; then
        echo "==> Reconnecting to Tailscale using persisted state..."
    else
        echo "==> Connecting to Tailscale as '${TS_HOSTNAME}'..."
    fi

    if tailscale up "${TS_UP_ARGS[@]}"; then
        TS_OK=true
        TS_IP=$(tailscale ip -4 2>/dev/null || echo 'pending')
        echo "==> Tailscale is up. IP: ${TS_IP}"

        if [ "${TS_SERVE_HTTPS}" = "true" ]; then
            echo "==> Enabling Tailscale HTTPS serve..."
            tailscale serve --bg http://localhost:8000
            echo "==> HTTPS available at https://${TS_HOSTNAME}.$(tailscale status --json | python3 -c "import sys,json; print(json.load(sys.stdin)['MagicDNSSuffix'])" 2>/dev/null || echo '<tailnet>.ts.net')"
        fi
    else
        echo "==> WARNING: Tailscale failed to connect. Continuing without it."
    fi
else
    echo "==> No TS_AUTHKEY set — skipping Tailscale. App will be available on port 8000 only."
fi

# Ensure the app user owns the mounted data/documents volumes
chown -R astro:astro /app/data /app/documents

# Drop privileges and run the app
echo "==> Starting Astro..."
exec su -s /bin/bash astro -c 'python -m src.main serve --port 8000'
