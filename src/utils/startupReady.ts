// Startup loading (ontology autoload, ?rdfUrl=, startup SHACL shapes) runs after the canvas
// mounts. An MCP call during that window would read or write a half-loaded graph, so results
// differ between repetitions. The MCP entry point rejects calls until startup is complete.

/** A startup that never reports completion (canvas failed to mount) must not lock tools out forever. */
const STARTUP_TIMEOUT_MS = 120_000;

let expectedAt: number | null = null;
let startupComplete = false;

/** Called by the app entry point before anything mounts. Without it (tests, other hosts) nothing is rejected. */
export function expectStartup(): void {
  expectedAt = Date.now();
}

/** Called once startup loading has finished or failed. Safe to call repeatedly. */
export function markStartupComplete(): void {
  startupComplete = true;
}

/** True once startup loading has finished. Exposed as window.__startupComplete for e2e tests. */
export function isStartupComplete(): boolean {
  return startupComplete;
}

/** True while startup loading is still running and MCP calls must be rejected. */
export function isStartupPending(): boolean {
  return expectedAt !== null && !startupComplete && Date.now() - expectedAt < STARTUP_TIMEOUT_MS;
}
