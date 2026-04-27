#!/usr/bin/env bash
set -euo pipefail

DEV_PID=""

cleanup() {
  if [ -n "$DEV_PID" ]; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Start dev server in background
npm run dev > /tmp/vite-demo.log 2>&1 &
DEV_PID=$!

# Wait until port 8080 accepts connections (max 30s)
echo "Waiting for dev server..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:8080 > /dev/null 2>&1; then
    echo "Dev server ready."
    break
  fi
  sleep 0.5
done

xvfb-run --auto-servernum --server-args='-screen 0 1920x1080x24' \
  npx playwright test --config=playwright.demo.config.ts \
  && node scripts/collect-demo-videos.mjs
