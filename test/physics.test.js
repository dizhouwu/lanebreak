const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const native = require('../src/physics.js');

test('the native and embedded WebAssembly physics resolve the same collisions and bolt hits', () => {
  const html = readFileSync(join(__dirname, '..', 'lanebreak.html'), 'utf8');
  const embedded = html.match(/const LanebreakPhysicsWasm = "([A-Za-z0-9+/=]+)"/)?.[1];
  assert.ok(embedded, 'The standalone game includes its physics module');
  const context = { atob, LanebreakPhysicsWasm:embedded };
  runInNewContext(readFileSync(join(__dirname, '..', 'src', 'physics.js'), 'utf8'), context);
  const wasm = context.LanebreakPhysics;

  const bodies = Float64Array.of(100, 450, 10, 0, 0, 110, 450, 10, 0, 1, 130, 450, 10, 0, 1);
  const nativeBodies = bodies.slice();
  native.separateUnits(nativeBodies, 5200);
  wasm.separateUnits(bodies, 5200);
  assert.equal(bodies[5], 116.5);
  assert.deepEqual(bodies, nativeBodies);

  const targets = Float64Array.of(20, 450, 10, 0, 30, 475, 10, 0, 100, 450, 10, 0);
  const nativeTargets = targets.slice();
  native.sweepBolt(nativeTargets, 0, 450, 1, 0, 50, 10);
  wasm.sweepBolt(targets, 0, 450, 1, 0, 50, 10);
  assert.deepEqual([targets[3], targets[7], targets[11]], [20, -1, -1]);
  assert.deepEqual(targets, nativeTargets);
});
