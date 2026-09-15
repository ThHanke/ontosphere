// llms.txt is what an agent reads to find and use Ontosphere, so it must match the code: the
// tool list is the registered manifest exactly, the served copy is identical, and the README
// states the same tool count.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mcpManifest } from '../manifest';

const root = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const llms = read('llms.txt');

describe('llms.txt', () => {
  it('is served unchanged from public/', () => {
    expect(read('public/llms.txt')).toBe(llms);
  });

  it('lists exactly the registered tools', () => {
    const start = llms.indexOf('## Tools');
    const end = llms.indexOf('\n## ', start + 1);
    const section = llms.slice(start, end);
    const listed = [...section.matchAll(/^- `([A-Za-z]+)`/gm)].map((m) => m[1]);
    const registered = mcpManifest.map((t) => t.name);
    expect(new Set(listed).size, 'no tool listed twice').toBe(listed.length);
    expect([...listed].sort()).toEqual([...registered].sort());
    expect(section.startsWith(`## Tools (${registered.length})`)).toBe(true);
  });

  it('agrees with the README on the tool count', () => {
    expect(read('README.md')).toContain(`MCP-${mcpManifest.length}_tools`);
  });
});
