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

# Clean up keyframes and stale artifacts
rm -rf docs/demo-keyframes/
rm -rf test-results/

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

# Warm up Vite's dep-optimization cache with a headless page load.
# Vite triggers dep pre-bundling on the first browser page load (causing a reload);
# by warming up here we ensure that reload happens before the recording tests start.
echo "Warming up Vite dep cache..."
node -e "
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:8080');
    await page.waitForFunction(
      () => !!(window).__mcpTools && typeof (window).__mcpTools.addNode === 'function' && (window.__startupComplete?.() ?? true),
      { timeout: 60000 }
    );
    console.log('Warmup: MCP tools ready.');
  } catch (e) {
    console.log('Warmup timeout — dep cache should be warm enough to proceed.');
  }
  await browser.close();
})().catch(e => { console.error('Warmup error:', e.message); process.exit(0); });
" 2>&1

xvfb-run --auto-servernum --server-args='-screen 0 1920x1080x24' \
  npx playwright test --config=playwright.demo.config.ts \
  && node scripts/collect-demo-videos.mjs
