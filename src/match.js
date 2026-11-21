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
    Backend = class {
      constructor(options) {
        input(options);
        this.id = wasm.engine_open();
        if (!this.id) throw new Error('Unable to start a match');
      }
      close() { wasm.engine_close(this.id); this.id = 0; }
      ended() { return wasm.engine_ended(this.id); }
      step(dt, count) { wasm.engine_step(this.id, dt, count); }
      snapshot(team, full) { return output(wasm.engine_snapshot(this.id, team, full)); }
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
    snapshot(team, full = false) { return JSON.parse(this.backend.snapshot(team, full)); }
    snapshotWorldJson() { return this.backend.snapshotWorld(); }
    snapshotViewJson(team) { return this.backend.snapshotView(team, false); }
    dispose() { this.backend.close?.(); }
  }
  const api = { Match, validOrder };
  if (native) module.exports = api;
  else globalThis.LanebreakMatch = api;
})();
