// @vitest-environment node
//
// The "write the full class hierarchy" setting (AppConfig.reasonerClosure) reaches the package as
// materialize({ closure }). Test case: public/reasoning-demo.ttl, whose chain is
// Person <- Employee <- Manager <- Executive. Without closure the inferred graph holds the direct
// edges only; with it every transitive subclass pair is there; toggling on one reasoner works.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import fs from 'node:fs';
import path from 'node:path';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { DlReasoner } from '../rdfManager.runtime.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const SUB = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const INFERRED = 'urn:vg:inferred';

function demoStore(): N3.Store {
  const ttl = fs.readFileSync(path.resolve(__dirname, '../../../public/reasoning-demo.ttl'), 'utf8');
  return new N3.Store(new N3.Parser().parse(ttl).map((q) => quad(q.subject, q.predicate, q.object, nn('urn:vg:data'))));
}

const subPairs = (store: N3.Store, ex: string, pairs: [string, string][]) =>
  pairs.map(([a, b]) => store.countQuads(nn(ex + a), nn(SUB), nn(ex + b), nn(INFERRED)) > 0);

describe('reasoner closure setting, reasoning-demo', () => {
  it('writes transitive subclass pairs only when closure is on, and toggling on one reasoner works', async () => {
    let lib: RdfReasoner;
    try { lib = new RdfReasoner({ excludeGraphs: [] } as any); await lib.ready; } catch (e) {
      if (process.env.REQUIRE_KONCLUDE) throw e;
      return; // no Konclude in this environment
    }
    const dl = new DlReasoner(lib);
    const store = demoStore();
    const ex = [...store.getQuads(null, null, null, null)]
      .map((q) => q.subject.value).find((v) => v.endsWith('Executive'))!.replace(/Executive$/, '');
    const direct: [string, string][] = [['Executive', 'LeadershipTeam'], ['TeamLead', 'LeadershipTeam'], ['LeadershipTeam', 'Employee']];
    const transitive: [string, string][] = [['Executive', 'Employee'], ['TeamLead', 'Employee'], ['Contractor', 'DirectorRole']];

    await dl.reason(store, undefined, { closure: false });
    const offDirect = subPairs(store, ex, direct);
    expect(offDirect).toEqual([true, true, true]);
    const offTransitive = subPairs(store, ex, transitive);
    const offCount = store.countQuads(null, nn(SUB), null, nn(INFERRED));

    await dl.reason(store, undefined, { closure: true });
    const onTransitive = subPairs(store, ex, transitive);
    const onCount = store.countQuads(null, nn(SUB), null, nn(INFERRED));

    expect(offTransitive).toEqual([false, false, false]);
    expect(onTransitive).toEqual([true, true, true]);
    expect(onCount).toBeGreaterThan(offCount);
    expect(subPairs(store, ex, direct)).toEqual([true, true, true]);

    await dl.reason(store, undefined, { closure: false });
    expect(store.countQuads(null, nn(SUB), null, nn(INFERRED))).toBe(offCount);
    dl.terminate();
  }, 60_000);
});
