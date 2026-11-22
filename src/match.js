(function () {
  const native = typeof module === 'object';
  let Backend;
  let validOrder;
  if (native) {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const target = join(__dirname, '..', 'target', process.platform + '-' + process.arch);
    const name = readFileSync(join(target, 'engine-addon.txt'), 'utf8').trim();
    const binding = require(join(target, name));
    Backend = binding.RustMatch;
    validOrder = command => binding.validOrder(JSON.stringify(command) ?? '');
  } else {
    const data = Uint8Array.from(atob(LanebreakEngineWasm), c => c.charCodeAt(0));
    const wasm = new WebAssembly.Instance(new WebAssembly.Module(data)).exports;
    const encoder = new TextEncoder(), decoder = new TextDecoder();
    function input(text) {
      const bytes = encoder.encode(text);
      const offset = wasm.engine_input(bytes.length);
      new Uint8Array(wasm.memory.buffer, offset, bytes.length).set(bytes);
    }
    function output(offset) {
      return decoder.decode(new Uint8Array(wasm.memory.buffer, offset, wasm.engine_output_len()));
    }
    function snapshot(id, team, full) {
      const offset = wasm.engine_snapshot(id, team, full);
      const memory = wasm.memory.buffer;
      const frame = new Uint32Array(memory, offset, 4);
      const data = JSON.parse(decoder.decode(new Uint8Array(memory, frame[0], frame[1])));
      if (!frame[3]) return data;
      const [state, strings] = data;
      // Decode within this call. The engine reuses the frame buffers on the next snapshot.
      const rows = new Uint32Array(memory, frame[2], frame[3]);
      let at = 2;
      for (let i = 0; i < rows[0]; i++, at += 9) {
        const metadata = rows[at + 7];
        const creep = [
          rows[at], metadata & 1, strings[metadata >>> 10],
          (rows[at + 1] | 0) / 10, (rows[at + 2] | 0) / 10,
          rows[at + 3] | 0, rows[at + 4] | 0, Boolean(metadata & 2),
          (rows[at + 5] | 0) / 10, (rows[at + 6] | 0) / 100, (metadata >>> 2) & 255
        ];
        if (rows[at + 8]) creep.push(rows[at + 8]);
        state.creeps.push(creep);
      }
      if (rows[1] !== state.projectiles.length) {
        const spells = state.projectiles;
        const projectiles = new Array(rows[1]);
        let spell = 0;
        for (let i = 0; i < projectiles.length; i++, at += 4) {
          const id = rows[at], metadata = rows[at + 3];
          projectiles[i] = id ? [id, metadata & 1, 'attack', (rows[at + 1] | 0) / 10,
            (rows[at + 2] | 0) / 10, strings[metadata >>> 1]] : spells[spell++];
        }
        state.projectiles = projectiles;
      }
      return state;
    }
    Backend = class {
      constructor(options) {
        input(options);
        this.id = wasm.engine_open();
        if (!this.id) throw new Error('Unable to start a match');
      }
      close() { wasm.engine_close(this.id); this.id = 0; }
      ended() { return wasm.engine_ended(this.id); }
      step(dt, count) { wasm.engine_step(this.id, dt, count); }
      snapshot(team, full) { return snapshot(this.id, team, full); }
      order(team, command) { input(command); return output(wasm.engine_order(this.id, team)) || null; }
      finish(winner, reason) { input(reason); wasm.engine_finish(this.id, winner ?? -1); }
    };
  }

  class Match {
    constructor(options = {}) {
      this.backend = new Backend(JSON.stringify({ seed:Date.now(), ...options }));
    }
    get mode() { return this.backend.ended() ? 'ended' : 'match'; }
    step(dt, count = 1) { this.backend.step(dt, count); }
    order(team, command) { return this.backend.order(team, JSON.stringify(command)) ?? null; }
    finish(winner, reason) { this.backend.finish(winner, reason); }
    notice(team, text) { this.backend.notice(team, text); }
    setBot(team, bot) { this.backend.setBot(team, bot); }
    snapshot(team, full = false) {
      const state = this.backend.snapshot(team, full);
      return native ? JSON.parse(state) : state;
    }
    snapshotWorldJson() { return this.backend.snapshotWorld(); }
    snapshotViewJson(team, after) { return this.backend.snapshotView(team, false, after); }
    effectCursor() { return this.backend.effectCursor(); }
    dispose() { this.backend.close?.(); }
  }
  const api = { Match, validOrder };
  if (native) module.exports = api;
  else globalThis.LanebreakMatch = api;
})();
