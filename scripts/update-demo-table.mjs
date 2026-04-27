#!/usr/bin/env node
/**
 * After `npm run demo:all`, patches the README.md MCP demo table so each row
 * shows the last SVG snapshot produced by that demo's seed run.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const README = path.join(ROOT, 'README.md');
const DEMO_DIR = path.join(ROOT, 'docs', 'mcp-demo');

const DEMOS = [
  { name: 'foaf-social-network',  title: 'FOAF social network' },
  { name: 'reasoning-demo',       title: 'OWL-RL reasoning' },
  { name: 'scene-ontology',       title: 'Scene ontology' },
  { name: 'pizza-tutorial',       title: 'Manchester Pizza Tutorial' },
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lastSvg(demoName) {
  const imgDir = path.join(DEMO_DIR, demoName);
  if (!fs.existsSync(imgDir)) return null;
  const svgs = fs.readdirSync(imgDir).filter(f => f.endsWith('.svg')).sort();
  return svgs.length ? svgs[svgs.length - 1] : null;
}

let readme = fs.readFileSync(README, 'utf8');

for (const { name, title } of DEMOS) {
  const svg = lastSvg(name);
  if (!svg) { console.log(`  skip ${name} — no SVGs`); continue; }

  const mdPath  = `docs/mcp-demo/${name}.md`;
  const imgSrc  = `docs/mcp-demo/${name}/${svg}`;
  const imgAlt  = `${title} final state`;
  const newCell = ` [![${imgAlt}](${imgSrc})](${mdPath}) `;

  const rowRe = new RegExp(
    `(\\| \\*\\*\\[${escapeRe(title)}\\]\\([^)]+\\)\\*\\*.*?\\|)([^|]+)(\\|)`,
    's'
  );
  if (rowRe.test(readme)) {
    readme = readme.replace(rowRe, `$1${newCell}$3`);
    console.log(`  ${name} → ${svg}`);
  } else {
    console.warn(`  no row matched for "${title}"`);
  }
}

fs.writeFileSync(README, readme);
console.log('README.md updated.');
