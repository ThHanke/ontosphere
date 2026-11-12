// @vitest-environment node
//
// explainEntailment in the worker: "exact" (guaranteed minimal) is the default because the reasoner's
// cached shortcut can hand back an inferred edge after a reasoning run. If the exact search ends without
// a justification (its time limit) the worker asks "fast" for one verified candidate, and if that also
// has nothing the answer says so (justificationUnavailable); an empty list is never "directly asserted".
import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime, setDlReasonerFactoryForTest, ENTAILMENT_EXACT_TIMEOUT_MS, type DlReasonerLike } from '../rdfManager.runtime.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const EX = 'http://example.org/#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const axiom = quad(nn(`${EX}x`), nn(`${EX}p`), nn(`${EX}y`), nn('urn:vg:data'));

type Answer = { isEntailed: boolean | null; justifications: N3.Quad[][]; vacuous?: boolean; ontologyInconsistent?: boolean; justificationUnavailable?: boolean; reason?: string };
type Call = { mode?: string; timeout?: number; max?: number };

function setup(answers: Partial<Record<'exact' | 'fast', Answer>>) {
  const calls: Call[] = [];
  const reasoner = {
    ready: Promise.resolve(),
    async checkConsistency() { return true; },
    async reason() { return { delta: { added: [], removed: [] } }; },
    async validate() { return { consistent: true, errors: [], warnings: [] }; },
    async explainInconsistency() { return []; },
    async explainEntailment(_s: unknown, _a: string, _b: string, _c: string, opts: any) {
      calls.push({ mode: opts?.justificationMode, timeout: opts?.timeout, max: opts?.maxJustifications });
      return answers[opts?.justificationMode as 'exact' | 'fast'] ?? { isEntailed: false, justifications: [] };
    },
    terminate() { /* nothing */ },
  } as unknown as DlReasonerLike;
  setDlReasonerFactoryForTest(() => reasoner);
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  let n = 0;
  const explain = async (payload: Record<string, unknown> = {}, waitMs = 10_000) => {
    const id = `explain-${++n}`;
    runtime.handleEvent({
      type: 'command', id, command: 'explainEntailment',
      payload: { subjectIri: `${EX}x`, predicateIri: TYPE, objectIri: `${EX}C`, ...payload },
    });
    const deadline = Date.now() + waitMs;
    while (!messages.some((m) => m?.type === 'response' && m?.id === id)) {
      if (Date.now() > deadline) throw new Error('explainEntailment did not respond');
      await new Promise((r) => setTimeout(r, 5));
    }
    return messages.find((m) => m?.type === 'response' && m?.id === id);
  };
  return { calls, explain };
}

afterEach(() => setDlReasonerFactoryForTest(null));

describe('explainEntailment modes in the worker', () => {
  it('asks for the exact search by default, with the app time limit, and does not fall back when it answers', async () => {
    const { calls, explain } = setup({ exact: { isEntailed: true, justifications: [[axiom]] } });
    const res = await explain();
    expect(calls).toEqual([{ mode: 'exact', timeout: ENTAILMENT_EXACT_TIMEOUT_MS, max: 1 }]);
    expect(res.result).toMatchObject({ isEntailed: true, justificationMode: 'exact' });
    expect(res.result.justifications).toHaveLength(1);
    expect(res.result.justificationUnavailable).toBeUndefined();
  });

  it('exact ends with nothing (time limit): one verified fast candidate, labelled as not guaranteed minimal', async () => {
    const { calls, explain } = setup({
      exact: { isEntailed: true, justifications: [] },
      fast: { isEntailed: true, justifications: [[axiom]] },
    });
    const res = await explain({ timeoutMs: 5000 });
    expect(calls.map((c) => c.mode)).toEqual(['exact', 'fast']);
    expect(calls[0].timeout).toBe(5000);
    expect(calls[1].timeout).toBeUndefined();
    expect(res.result).toMatchObject({ isEntailed: true, justificationMode: 'fast' });
    expect(res.result.reason).toContain('did not finish within 5 s');
    expect(res.result.reason).toContain('not guaranteed minimal');
    expect(res.result.justifications).toHaveLength(1);
  });

  it('nothing from exact and nothing from fast: justificationUnavailable, never an empty list that looks asserted', async () => {
    const { explain } = setup({
      exact: { isEntailed: true, justifications: [] },
      fast: { isEntailed: true, justifications: [], justificationUnavailable: true, reason: 'no sound candidate' },
    });
    const res = await explain();
    expect(res.result).toMatchObject({ isEntailed: true, justifications: [], justificationUnavailable: true, reason: 'no sound candidate' });
  });

  it('flags justificationUnavailable itself when fast returns an empty list without the flag', async () => {
    const { explain } = setup({
      exact: { isEntailed: true, justifications: [] },
      fast: { isEntailed: true, justifications: [] },
    });
    const res = await explain();
    expect(res.result.justificationUnavailable).toBe(true);
    expect(res.result.reason).toContain('No justification was found within 60 s');
  });

  it('justificationMode "fast" asks once, without a search limit', async () => {
    const { calls, explain } = setup({ fast: { isEntailed: true, justifications: [[axiom]] } });
    const res = await explain({ justificationMode: 'fast' });
    expect(calls).toEqual([{ mode: 'fast', timeout: undefined, max: 1 }]);
    expect(res.result.justificationMode).toBe('fast');
  });

  it.each([
    ['not entailed', { isEntailed: false, justifications: [] as N3.Quad[][] }],
    ['vacuous', { isEntailed: true, justifications: [] as N3.Quad[][], vacuous: true }],
    ['inconsistent ontology', { isEntailed: null, justifications: [] as N3.Quad[][], ontologyInconsistent: true }],
  ])('%s is a final answer: no fast fallback', async (_name, answer) => {
    const { calls, explain } = setup({ exact: answer as Answer });
    const res = await explain();
    expect(calls).toHaveLength(1);
    expect(res.result.justificationUnavailable).toBeUndefined();
  });

  it('caches per input state and per mode', async () => {
    const { calls, explain } = setup({
      exact: { isEntailed: true, justifications: [[axiom]] },
      fast: { isEntailed: true, justifications: [[axiom]] },
    });
    // the first command of a runtime creates the shared store, which moves the input generation: warm it up
    await explain({ objectIri: `${EX}warmup` });
    const base = calls.length;
    await explain();
    await explain();
    expect(calls.length - base).toBe(1);
    await explain({ justificationMode: 'fast' });
    expect(calls.length - base).toBe(2);
  });

  it('drops a request whose justificationMode is neither fast nor exact before it reaches the reasoner', async () => {
    const { calls, explain } = setup({});
    await expect(explain({ justificationMode: 'causal' }, 150)).rejects.toThrow('did not respond');
    expect(calls).toHaveLength(0);
  });
});
