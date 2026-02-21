#!/usr/bin/env bash
set -e

# The named volume for .venv is initially owned by root; fix ownership.
echo "==> Fixing .venv volume permissions..."
sudo chown "$(id -u):$(id -g)" .venv

echo "==> Creating virtual environment..."
python -m venv .venv

echo "==> Installing dependencies..."
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "==> Starting Tailscale daemon..."
sudo tailscaled --tun=userspace-networking --socks5-server=localhost:1055 --outbound-http-proxy-listen=localhost:1056 &

echo "==> Done! Activate with: source .venv/bin/activate"
