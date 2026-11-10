// Results derived from the reasoning input (explanations, justifications) are valid only for the
// input they were computed from. The worker's reasoningInputGeneration moves on with every write
// to an axiom graph (add, remove, graph removal, unload, store reset), so it is the one signal
// that invalidates every such cache. A value computed against an older generation is never stored,
// so a write that lands while the reasoner works cannot leave a stale entry behind.

export class GenerationCache<V> {
  private readonly entries = new Map<string, V>();
  private generation = -1;

  private sync(current: number): void {
    if (this.generation !== current) {
      this.entries.clear();
      this.generation = current;
    }
  }

  get(key: string, current: number): V | undefined {
    this.sync(current);
    return this.entries.get(key);
  }

  /** Stores `value` only if the input has not changed since `computedAt`. Returns whether it was stored. */
  set(key: string, value: V, computedAt: number, current: number): boolean {
    this.sync(current);
    if (computedAt !== current) return false;
    this.entries.set(key, value);
    return true;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
