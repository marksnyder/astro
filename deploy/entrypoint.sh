#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# entrypoint.sh — Start Tailscale, then launch the Astro app.
#
# Environment variables:
#   TS_AUTHKEY    — Tailscale auth key (required on first run)
#   TS_HOSTNAME   — Tailscale hostname (default: "astro")
#   TS_SERVE_HTTPS — Set to "true" to enable Tailscale HTTPS (default: true)
#   TS_EXTRA_ARGS — Extra args passed to `tailscale up`
# ──────────────────────────────────────────────────────────────
set -euo pipefail

TS_HOSTNAME="${TS_HOSTNAME:-astro}"
TS_SERVE_HTTPS="${TS_SERVE_HTTPS:-true}"

echo "==> Starting tailscaled..."
tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &

# Wait for tailscaled to be ready
sleep 2

# Build tailscale up command
TS_UP_ARGS=(--hostname="${TS_HOSTNAME}")

if [ -n "${TS_AUTHKEY:-}" ]; then
    TS_UP_ARGS+=(--authkey="${TS_AUTHKEY}")
fi

if [ -n "${TS_EXTRA_ARGS:-}" ]; then
    # shellcheck disable=SC2206
    TS_UP_ARGS+=(${TS_EXTRA_ARGS})
fi

echo "==> Connecting to Tailscale as '${TS_HOSTNAME}'..."
tailscale up "${TS_UP_ARGS[@]}"

TS_IP=$(tailscale ip -4 2>/dev/null || echo 'pending')
echo "==> Tailscale is up. IP: ${TS_IP}"

# Enable Tailscale HTTPS — proxies https://<hostname>.<tailnet>.ts.net → localhost:8000
if [ "${TS_SERVE_HTTPS}" = "true" ]; then
    echo "==> Enabling Tailscale HTTPS serve..."
    tailscale serve --bg http://localhost:8000
    echo "==> HTTPS available at https://${TS_HOSTNAME}.$(tailscale status --json | python3 -c "import sys,json; print(json.load(sys.stdin)['MagicDNSSuffix'])" 2>/dev/null || echo '<tailnet>.ts.net')"
fi

# Drop privileges and run the app
echo "==> Starting Astro..."
exec su -s /bin/bash astro -c 'python -m src.main serve --port 8000'
