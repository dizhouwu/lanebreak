const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { Match, validOrder } = require('../src/match.js');
const { HEROES, ITEMS } = require('../src/rules.json');
const { abilityCastMode, buyPlan, pickTarget, pickUnit, pickSpellTarget } = require('../src/game-view.js');

const dt = 1 / 60;

function browserMatch() {
  const html = readFileSync(join(__dirname, '..', 'lanebreak.html'), 'utf8');
  const embedded = html.match(/const LanebreakEngineWasm = "([A-Za-z0-9+/=]+)"/)?.[1];
  assert.ok(embedded, 'The standalone game includes the Rust match engine');
  const context = { atob, TextEncoder, TextDecoder, LanebreakEngineWasm:embedded };
  runInNewContext(readFileSync(join(__dirname, '..', 'src', 'match.js'), 'utf8'), context);
  return context.LanebreakMatch.Match;
}

function prepare(match, keys) {
  for (const key of keys + 'R') {
    assert.equal(match.order(0, { o:'cast', i:'QWER'.indexOf(key), x:2180, y:450, castMode:'self' }), null);
  }
}

test('native and browser Rust engines agree on commands, marks, training, and outcomes', () => {
  const BrowserMatch = browserMatch();
  const options = { heroes:['neris','brakk'], training:{ dummy:true }, seed:42 };
  const native = new Match(options), browser = new BrowserMatch(options);
  const comparable = value => typeof value === 'number' ? Number(value.toFixed(7)) || 0 :
    Array.isArray(value) ? Array.from(value, comparable) : value && typeof value === 'object' ?
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, comparable(item)])) : value;
  function check() { assert.deepEqual(comparable(browser.snapshot(0)), comparable(native.snapshot(0))); }
  check();
  for (const match of [native, browser]) {
    prepare(match,'WWQ');
    prepare(match,'EEW');
    assert.equal(match.order(0, { o:'cast', i:5, x:2750, y:450, castMode:'point', recipe:'QWW' }), null);
    assert.equal(match.order(0, { o:'cast', i:4, x:2750, y:450, castMode:'point', recipe:'WEE' }), null);
    match.step(dt, 40);
  }
  check();
  assert.equal(native.snapshot(0).heroes[1].lifted,true);
  assert.equal(native.snapshot(0).heroes[1].burning,true);
  for (const match of [native,browser]) {
    prepare(match,'QQQ');
    assert.match(match.order(0, { o:'cast', i:4, id:1, castMode:'unit', recipe:'QQQ' }), /enemy hero/);
    assert.equal(match.order(0, { o:'cast', i:4, id:2, castMode:'unit', recipe:'QQQ' }), null);
    match.step(dt,95);
  }
  check();
  assert.ok(native.snapshot(0).training.hits > 4);
  native.finish(null, 'quit');
  browser.finish(null, 'quit');
  check();
  assert.equal(browser.mode,'ended');
  browser.dispose();
});

test('native and browser bot matches advance the same state from the same seed', () => {
  const BrowserMatch = browserMatch();
  const options = { heroes:['vesper','brakk'], bots:['hard','hard'], seed:81 };
  const native = new Match(options), wasm = new BrowserMatch(options);
  for (let i = 0; i < 90; i++) {
    native.step(dt, 60);
    wasm.step(dt, 60);
    const a = native.snapshot(0), b = wasm.snapshot(0);
    assert.equal(a.wave,b.wave);
    assert.deepEqual(a.creeps, JSON.parse(JSON.stringify(b.creeps)));
    assert.deepEqual(a.kills, JSON.parse(JSON.stringify(b.kills)));
    for (let team = 0; team < 2; team++) {
      for (const key of ['hp','mana','x','y']) assert.ok(Math.abs(a.heroes[team][key] - b.heroes[team][key]) < 1e-6);
    }
  }
  wasm.dispose();
});

test('the server validates positions, slots, target ids, and stale prepared spells', () => {
  assert.equal(validOrder({o:'cast', i:4, id:2, castMode:'unit', recipe:'QQQ'}),true);
  assert.equal(validOrder({o:'cast', i:4, id:-1, castMode:'unit', recipe:'QQQ'}),false);
  assert.equal(validOrder({o:'cast', i:4, castMode:'point', x:1e9, y:0}),false);
  assert.equal(validOrder({o:'buy', id:'__proto__'}),false);
  assert.equal(validOrder({o:'cast', i:3, castMode:'self', x:0, y:0, recipe:'QQQ'}),false);
  const m = new Match({ heroes:['neris','brakk'], training:{ dummy:true } });
  prepare(m,'WWQ');
  assert.match(m.order(0, {o:'cast', i:4, castMode:'self', x:2500, y:450, recipe:'QQW'}), /Select the ability again/);
  assert.equal(m.snapshot(0).projectiles.length,0);
});

test('targeting previews distinguish point, self, and enemy hero spells', () => {
  const expected = {
    vesper:['point','point','self','point'], brakk:['point','self','self','self'],
    orrin:['point','point','point','point'], sable:['point','point','self','point'],
    mirel:['point','point','self','point'], neris:['self','self','self','self'],
    cairn:['self','self','self','self'], ecarg:['point','point','self','point']
  };
  for (const [hero, kit] of Object.entries(HEROES)) {
    assert.deepEqual(kit.abilities.slice(0,4).map(abilityCastMode),expected[hero]);
  }
  assert.equal(abilityCastMode(HEROES.neris.weaves.QQQ),'unit');
  const game = new Match({ heroes:['neris','brakk'], training:{dummy:true} });
  const s = game.snapshot(0);
  const dummy = s.heroes[1];
  assert.equal(pickSpellTarget(s,s.heroes[0],HEROES.neris.weaves.QQQ,{x:dummy.x,y:dummy.y-45}).id,dummy.id);
  assert.equal(pickSpellTarget(s,s.heroes[0],HEROES.neris.weaves.QQQ,{x:dummy.x+160,y:dummy.y}),null);
  const duel = new Match({ bots:[null,null], seed:44 }).snapshot(0);
  const tower = duel.buildings.find(b=>b.kind==='inner'&&b.team===1);
  assert.equal(pickTarget(duel,0,tower),null);
  assert.equal(pickUnit(duel,tower).id,tower.id);
});

test('the recipe display agrees with an executioner purchase using existing components', () => {
  const match = new Match({ training:{ dummy:false } });
  for (const key of ['stone', 'gloves']) assert.equal(match.order(0,{o:'buy',id:key}),null);
  const h = match.snapshot(0).heroes[0];
  const quote = buyPlan(h,'executioner',true);
  assert.equal(quote.cost,ITEMS.executioner.total - ITEMS.stone.cost - ITEMS.gloves.cost);
  assert.deepEqual(quote.consumed,[0,1]);
  assert.equal(match.order(0,{o:'buy',id:'executioner'}),null);
  const bought = match.snapshot(0).heroes[0];
  assert.equal(bought.gold,h.gold-quote.cost);
  assert.deepEqual(bought.loadout,['executioner']);
});
