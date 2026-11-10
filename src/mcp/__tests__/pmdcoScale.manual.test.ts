// @vitest-environment node
// Manual timing: suggestDeletionRepairs on PMDco + one clash, real Konclude, node. PMDCO_SCALE=1 to run.
import { it, expect } from 'vitest';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import * as N3 from 'n3';
import * as fs from 'fs';
import { suggestDeletionRepairs } from '../tools/repairAdapter';

const BFO = 'http://purl.obolibrary.org/obo/';
it.skipIf(!process.env.PMDCO_SCALE)('PMDco + clash timing', async () => {
  const store = new N3.Store(new N3.Parser().parse(fs.readFileSync('public/bench-pmdco.ttl', 'utf8')).map((q) => N3.DataFactory.quad(q.subject, q.predicate, q.object, N3.DataFactory.namedNode('urn:vg:data'))));
  const x = N3.DataFactory.namedNode('http://example.org/clash#x');
  for (const c of ['BFO_0000002', 'BFO_0000003']) store.addQuad(N3.DataFactory.quad(x, N3.DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), N3.DataFactory.namedNode(BFO + c), N3.DataFactory.namedNode('urn:vg:data')));
  const r = new RdfReasoner(); await r.ready;
  const lap = (label: string, t0: number) => fs.appendFileSync('logs/pmdco-node-laps.log', `[PMDCO_NODE] ${label} ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  let t = Date.now();
  expect(await r.checkConsistency(store)).toBe(false); lap('checkConsistency', t);
  t = Date.now(); const j = await r.explainInconsistency(store, { maxJustifications: 3 }); lap(`explainInconsistency (${j.length})`, t);
  t = Date.now(); const rep = await r.repair(store, { maxJustifications: 3 }); lap(`repair (${rep.repairs.length} sets, incomplete=${rep.incomplete})`, t);
  t = Date.now(); const lac = await r.explainInconsistencyLaconic(store, { maxJustifications: 3 }); lap(`explainInconsistencyLaconic (${lac.length})`, t);
  r.terminate();
}, 900_000);
