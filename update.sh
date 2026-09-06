#!/bin/bash
set -e

echo "========================================"
echo "⚡ Updating SnapHost to latest version..."
echo "========================================"

cd "$(dirname "$0")"

# 1. Git pull
echo "[1/3] Pulling latest git changes..."
git pull

# 2. Dependencies
echo "[2/3] Updating npm production dependencies..."
npm install --omit=dev

# 3. Restart systemd service
echo "[3/3] Restarting SnapHost service..."
if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl restart snaphost
    echo "✓ Service restarted successfully!"
    sudo systemctl status snaphost --no-pager -n 5
else
    echo "Note: systemctl not found, please restart your process manually."
fi

echo "========================================"
echo "✓ Update completed successfully!"
echo "========================================"
