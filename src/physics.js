(function () {
  if (typeof module === 'object') {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const target = join(__dirname, '..', 'target', process.platform + '-' + process.arch);
    try {
      const filename = readFileSync(join(target, 'physics-addon.txt'), 'utf8').trim();
      module.exports = require(join(target, filename));
    } catch (error) {
      throw new Error('Could not load the Rust physics module. Run npm run build on this machine.', { cause:error });
    }
    return;
  }

  const bytes = Uint8Array.from(atob(LanebreakPhysicsWasm), c => c.charCodeAt(0));
  const { memory, physics_rows, separate_units, sweep_bolt } = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  function prepare(rows) {
    const offset = physics_rows(rows.length);
    const buffer = new Float64Array(memory.buffer, offset, rows.length);
    buffer.set(rows);
    return buffer;
  }
  globalThis.LanebreakPhysics = {
    separateUnits(rows, width) {
      const buffer = prepare(rows);
      separate_units(width);
      rows.set(buffer);
    },
    sweepBolt(rows, x, y, dx, dy, length, radius) {
      const buffer = prepare(rows);
      sweep_bolt(x, y, dx, dy, length, radius);
      rows.set(buffer);
    }
  };
})();
