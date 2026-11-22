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

test('training hero switches keep the session and clear the previous kit', () => {
  const switchHero = hero => ({o:'trainingHero', hero});
  assert.equal(validOrder(switchHero('cairn')), false, 'hero switches are not network orders');
  const duel = new Match({heroes:['neris','brakk']});
  assert.match(duel.order(0, switchHero('cairn')), /only available in training/);
  for (const Engine of [Match, browserMatch()]) {
    const match = new Engine({heroes:['neris','brakk'], training:{dummy:true}, seed:42});
    const snapshot = () => JSON.parse(JSON.stringify(match.snapshot(0)));
    assert.equal(match.order(0, {o:'buy', id:'boots'}), null);
    match.order(0, {o:'move', x:2370, y:460});
    match.step(dt, 20);
    prepare(match, 'QQQ');
    assert.equal(match.order(0, {o:'cast', i:4, id:2, castMode:'unit', recipe:'QQQ'}), null);
    prepare(match, 'QEE');
    assert.equal(match.order(0, {o:'cast', i:4, x:2570, y:450, castMode:'point', recipe:'QEE'}), null);
    prepare(match, 'EEW');
    assert.equal(match.order(0, {o:'cast', i:4, x:2750, y:450, castMode:'point', recipe:'WEE'}), null);
    const before = snapshot();
    assert.ok(before.areas.length && before.creeps.length && before.heroes[1].stitched);
    assert.ok(before.training.damage > 0);
    assert.equal(match.order(0, switchHero('missing')), 'Invalid order');
    assert.equal(match.order(1, switchHero('cairn')), 'Invalid order');
    assert.equal(match.order(0, switchHero('cairn')), null);
    const after = snapshot();
    assert.equal(after.time, before.time);
    assert.deepEqual(after.training, before.training);
    assert.equal(after.heroes[0].hero, 'cairn');
    assert.equal(after.heroes[0].heat, HEROES.cairn.heat.max);
    assert.equal(after.heroes[0].mana, after.heroes[0].maxMana);
    for (const key of ['id','x','y','facing','level','gold','inventory']) {
      assert.deepEqual(after.heroes[0][key], before.heroes[0][key]);
    }
    const {stitched, ...dummy} = before.heroes[1];
    assert.deepEqual(after.heroes[1], {...dummy, stunned:false});
    for (const key of ['areas','creeps','effects','projectiles']) assert.deepEqual(after[key], []);
    assert.equal(match.order(0, switchHero('neris')), null);
    assert.deepEqual(snapshot().heroes[0].prepared, []);
    match.dispose();
  }
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
    orrin:['point','point','point','point'], kestrel:['self','unit','self','point'],
    veyra:['self','point','self','point'],
    neris:['self','self','self','self'],
    cairn:['self','self','self','self'], ecarg:['point','point','self','point']
  };
  for (const [hero, kit] of Object.entries(HEROES)) {
    assert.deepEqual(kit.abilities.slice(0,4).map(abilityCastMode),expected[hero]);
  }
  assert.equal(abilityCastMode(HEROES.neris.weaves.QQQ),'unit');
  assert.equal(abilityCastMode(HEROES.veyra.abilities[4]),'point');
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

test('Kestrel plants Ion Beacon at the cast position and leaves it there while moving', () => {
  for (const Engine of [Match, browserMatch()]) {
    const match = new Engine({ heroes:['kestrel','brakk'], training:{dummy:false} });
    const { x, y } = match.snapshot(0).heroes[0];
    assert.match(match.order(0, { o:'cast', i:0, x:x+300, y, castMode:'point' }), /Select the ability again/);
    assert.equal(match.order(0, { o:'cast', i:0, x:x+300, y, castMode:'self' }), null);
    assert.equal(match.order(0, { o:'move', x:x+300, y }), null);
    match.step(dt, 20);
    const s = match.snapshot(0);
    assert.ok(s.heroes[0].x > x);
    assert.deepEqual(Array.from(s.areas[0].slice(3,5)), [x,y]);
    match.step(dt, 14);
    assert.ok(match.snapshot(0).effects.some(e => e.kind === 'burst' && e.ability === 'Ion Beacon' && e.x === x && e.y === y));
    match.dispose();
  }
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
