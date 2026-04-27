/**
 * After `npm run demo:video`, copies each recorded .webm from
 * test-results/demo/<hash>/ to docs/demo-videos/<name>.webm,
 * where <name> is derived from the spec file: demo-<name>.spec.ts.
 *
 * Old videos are overwritten so docs/demo-videos/ always reflects the
 * latest run.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'test-results', 'demo');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'demo-videos');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Map spec file stem → video name:  demo-advert-intro.spec.ts → advert-intro
const E2E_DIR = path.join(ROOT, 'e2e');
const specNames = fs.readdirSync(E2E_DIR)
  .filter(f => /^demo-.+\.spec\.ts$/.test(f))
  .map(f => f.replace(/^demo-/, '').replace(/\.spec\.ts$/, ''));

if (!fs.existsSync(RESULTS_DIR)) {
  console.error('No test-results/demo/ directory found. Run npm run demo:video first.');
  process.exit(1);
}

let copied = 0;
for (const name of specNames) {
  // Playwright names the output dir: e2e-demo-<name>-<hash>-demo/
  const subdirs = fs.readdirSync(RESULTS_DIR)
    .filter(d => d.startsWith(`demo-${name}`));

  for (const subdir of subdirs) {
    const videoPath = path.join(RESULTS_DIR, subdir, 'video.webm');
    if (!fs.existsSync(videoPath)) continue;
    const dest = path.join(OUTPUT_DIR, `${name}.webm`);
    fs.copyFileSync(videoPath, dest);
    const size = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(`✓ docs/demo-videos/${name}.webm  (${size} KB)`);

    // Convert to mp4 for broad playback compatibility
    const mp4 = path.join(OUTPUT_DIR, `${name}.mp4`);
    try {
      execFileSync('ffmpeg', [
        '-y', '-i', dest,
        '-c:v', 'libx264',
        '-crf', '20',
        '-preset', 'slow',
        '-profile:v', 'high',
        '-level:v', '4.2',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        mp4,
      ], { stdio: 'pipe' });
      const mp4size = (fs.statSync(mp4).size / 1024).toFixed(0);
      console.log(`✓ docs/demo-videos/${name}.mp4   (${mp4size} KB)`);
    } catch {
      console.warn(`  ffmpeg not found — skipping mp4 conversion for ${name}`);
    }

    copied++;
  }
}

if (copied === 0) {
  console.error('No video files found in test-results/demo/. Did the recording succeed?');
  process.exit(1);
}
