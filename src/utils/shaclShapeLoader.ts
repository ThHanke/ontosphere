import { Parser } from 'n3';
import { rdfManager } from './rdfManager';

const SHACL_GRAPH = 'urn:vg:shapes';
const SHAPE_EXTENSIONS = ['.ttl', '.shacl', '.turtle'];

export interface ShapeLoadEntry {
  name: string;
  url: string;
  shapeCount: number;
}

export interface ShapeLoadError {
  url: string;
  error: string;
}

export interface ShapeLoadManifest {
  loaded: ShapeLoadEntry[];
  errors: ShapeLoadError[];
  /** With `onlyIfEmpty`: shapes were already present, so nothing was written. */
  skipped?: boolean;
}

export interface ShapeLoadOptions {
  /**
   * Load only into an empty shapes graph and never clear it. For defaults applied at startup:
   * shapes a user or an agent loaded in the meantime must not be replaced or mixed with them.
   */
  onlyIfEmpty?: boolean;
}

interface GitHubContentItem {
  name: string;
  download_url: string | null;
  type: string;
}

function parseGitHubTreeUrl(url: string): { owner: string; repo: string; branch: string; path: string } | null {
  const match = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/,
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2], branch: match[3], path: match[4] };
}

function isShapeFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SHAPE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

async function fetchGitHubFolderFiles(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<{ name: string; downloadUrl: string }[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const resp = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!resp.ok) throw new Error(`GitHub API ${resp.status}: ${resp.statusText}`);
  const items: GitHubContentItem[] = await resp.json();
  return items
    .filter(item => item.type === 'file' && item.download_url && isShapeFile(item.name))
    .map(item => ({ name: item.name, downloadUrl: item.download_url! }));
}

async function fetchShapeFile(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed ${resp.status}: ${resp.statusText}`);
  return resp.text();
}

async function writeShapeFile(turtle: string, url: string, name: string): Promise<ShapeLoadEntry> {
  await rdfManager.loadRDFIntoGraph(turtle, SHACL_GRAPH, 'text/turtle');
  const SH_NODESHAPE = 'http://www.w3.org/ns/shacl#NodeShape';
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  const { items } = await rdfManager.fetchQuadsPage({ graphName: SHACL_GRAPH, limit: 0 });
  const shapeCount = (items ?? []).filter(
    q => q.predicate === RDF_TYPE && q.object === SH_NODESHAPE,
  ).length;
  return { name, url, shapeCount };
}

/** Parse a shape file and count its sh:NodeShape declarations; throws on invalid Turtle. */
function countNodeShapes(turtle: string, baseIRI: string): number {
  const SH_NODESHAPE = 'http://www.w3.org/ns/shacl#NodeShape';
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  return new Parser({ baseIRI }).parse(turtle)
    .filter(q => q.predicate.value === RDF_TYPE && q.object.value === SH_NODESHAPE).length;
}

/** Expand the comma-separated input, including GitHub folder URLs, into individual files. */
async function resolveShapeFiles(
  urlInput: string,
  errors: ShapeLoadError[],
): Promise<{ url: string; name: string }[]> {
  const files: { url: string; name: string }[] = [];
  for (const url of urlInput.split(',').map(s => s.trim()).filter(Boolean)) {
    const ghTree = parseGitHubTreeUrl(url);
    if (!ghTree) {
      files.push({ url, name: url.split('/').pop() ?? url });
      continue;
    }
    try {
      const found = await fetchGitHubFolderFiles(ghTree.owner, ghTree.repo, ghTree.path, ghTree.branch);
      if (found.length === 0) errors.push({ url, error: 'No .ttl/.shacl files found in folder' });
      for (const f of found) files.push({ url: f.downloadUrl, name: f.name });
    } catch (e) {
      errors.push({ url, error: String(e) });
    }
  }
  return files;
}

export async function loadShaclShapes(
  urlInput: string,
  options: ShapeLoadOptions = {},
): Promise<ShapeLoadManifest> {
  const loaded: ShapeLoadEntry[] = [];
  const errors: ShapeLoadError[] = [];
  const files = await resolveShapeFiles(urlInput, errors);

  if (options.onlyIfEmpty) {
    // Fetch and parse every file first, then write them together in one worker step that
    // writes only into an empty shapes graph, so shapes loaded meanwhile are never mixed in.
    const fetched: { url: string; name: string; turtle: string; shapeCount: number }[] = [];
    for (const f of files) {
      try {
        const turtle = await fetchShapeFile(f.url);
        fetched.push({ ...f, turtle, shapeCount: countNodeShapes(turtle, f.url) });
      } catch (e) {
        errors.push({ url: f.url, error: String(e) });
      }
    }
    if (fetched.length === 0) return { loaded, errors };
    const written = await rdfManager.loadRDFIntoGraphIfEmpty(fetched.map(f => f.turtle), SHACL_GRAPH, 'text/turtle');
    if (!written) return { loaded, errors, skipped: true };
    return { loaded: fetched.map(({ name, url, shapeCount }) => ({ name, url, shapeCount })), errors };
  }

  // Replace: clear existing shapes so the graph only contains triples from the new source
  await rdfManager.removeGraphAsync(SHACL_GRAPH);
  for (const f of files) {
    try {
      loaded.push(await writeShapeFile(await fetchShapeFile(f.url), f.url, f.name));
    } catch (e) {
      errors.push({ url: f.url, error: String(e) });
    }
  }
  return { loaded, errors };
}
