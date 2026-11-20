const test = require('node:test');
const assert = require('node:assert/strict');
const { Match, buyPlan, sellValue, spellDamage, physical, pickTarget, pickUnit, CREEP_FLAGS } = require('../src/engine.js');
const { HEROES, ITEMS } = require('../src/rules.js');

const advance = (match, elapsed) => {
  for (let i = 0; i < elapsed * 60 && match.mode === 'match'; i++) match.step(1 / 60);
};

test('waves spawn symmetrically and the fountain route clears the allied core', () => {
  const m = new Match({ bots: [null, null], seed: 44 });
  assert.equal(m.order(0, { o: 'move', x: 1700, y: 450 }), null);
  advance(m, 2);
  assert.equal(m.creeps.length, 8);
  assert.equal(m.creeps.find(c => c.kind === 'melee').hp, 420);
  advance(m, 5);
  assert.ok(m.heroes[0].x > 1000);
  assert.equal(m.heroes[0].hp, 780);
});

test('pointer targeting uses exact deny eligibility and skips protected towers', () => {
  const m = new Match({bots:[null,null]});
  m.spawn();
  for (const team of [0, 1]) {
    const creep = m.creeps.find(c => c.team === team);
    creep.hp = creep.maxHp / 2;
    assert.equal(pickTarget(m.snapshot(team), team, creep), null);
    assert.equal(pickUnit(m.snapshot(team), creep).id, creep.id);
    creep.hp -= .1;
    const view = m.snapshot(team);
    const row = view.creeps.find(c => c[0] === creep.id);
    assert.equal(row[5], creep.maxHp / 2);
    assert.ok(row[10] & CREEP_FLAGS.deniable);
    assert.equal(pickTarget(view, team, creep).id, creep.id);
    assert.equal(pickTarget(view, 1-team, creep).id, creep.id);
    const blocked = m.getBuilding(1-team, 'inner');
    assert.equal(pickTarget(view, team, blocked), null);
    assert.equal(pickUnit(view, blocked).id, blocked.id);
    assert.equal(pickUnit(view, m.heroes[team]).id, m.heroes[team].id);
  }
});

test('both players can see the tower range and the target during its windup', () => {
  const m = new Match({bots:[null,null]});
  const player = m.heroes[0], tower = m.getBuilding(1,'outer');
  Object.assign(player, { x:tower.x-500, y:tower.y });
  m.updateBuilding(tower,1/60);
  for (const team of [0, 1]) {
    const shown = m.snapshot(team).buildings.find(b => b.id === tower.id);
    assert.equal(shown.range,560);
    assert.equal(shown.target,player.id);
    assert.equal(shown.attack,true);
    assert.equal(shown.protected,false);
  }
});

test('snapshots carry the posing and telegraph data without changing spell timings', () => {
  const m = new Match({ heroes:['vesper','brakk'], bots:[null,null] });
  const h = m.heroes[0];
  m.gainXp(h, 500);
  m.order(0, {o:'cast',i:0,x:h.x,y:h.y+300});
  m.order(0, {o:'cast',i:1,x:h.x,y:h.y+300});
  m.order(0, {o:'cast',i:2,x:h.x,y:h.y});
  assert.equal(m.order(0, {o:'recall'}), null);
  const state = m.snapshot(1);
  assert.equal(state.heroes[0].facing, Math.PI / 2);
  assert.deepEqual(state.heroes[0].buffs,['Tailwind']);
  assert.equal(state.heroes[0].channel,3);
  assert.deepEqual(state.projectiles[0].slice(5),['vesper',0,1,30]);
  assert.deepEqual(state.areas[0].slice(5),[.5,.5,'vesper',false]);
});

test('recipe purchases use nested components and refund the gold spent', () => {
  const m = new Match();
  const h = m.heroes[0];
  h.gold = 6000;
  assert.equal(m.order(0, { o: 'buy', id: 'stone' }), null);
  assert.equal(m.order(0, { o: 'buy', id: 'gloves' }), null);
  assert.deepEqual(buyPlan(h, 'executioner'), { cost: 1320, consumed: [0, 1] });
  assert.equal(m.order(0, { o: 'buy', id: 'executioner' }), null);
  assert.deepEqual(h.inventory.map(i => i.id), ['executioner']);
  assert.equal(h.stats.damage, 111);
  assert.equal(m.order(0, { o: 'sell', i: 0 }), null);
  assert.equal(h.gold, 6000);
  Object.assign(h, { x: 1000, y: 450 });
  assert.match(m.order(0, { o: 'buy', id: 'boots' }), /fountain/);
});

test('active cooldown survives a sell and repurchase', () => {
  const m = new Match();
  const h = m.heroes[0];
  h.gold = 4000;
  assert.equal(m.order(0, { o: 'buy', id: 'locket' }), null);
  assert.equal(m.order(0, { o: 'item', i: 0, x: 400, y: 450 }), null);
  assert.equal(m.order(0, { o: 'sell', i: 0 }), null);
  assert.equal(m.order(0, { o: 'buy', id: 'locket' }), null);
  assert.match(m.order(0, { o: 'item', i: 0, x: 400, y: 450 }), /cooling/);
  assert.equal(h.itemsReady.locket, ITEMS.locket.cd);
});

test('Void Core uses the original recipe, cooldown reduction, and component resale prices', () => {
  const m = new Match({ heroes: ['orrin', 'brakk'], bots: [null, null] });
  const h = m.heroes[0];
  h.gold = 3000;
  assert.equal(ITEMS.void.total, 2300);
  assert.equal(m.order(0, { o:'buy', id:'arcane' }), null);
  assert.equal(m.order(0, { o:'buy', id:'rune' }), null);
  m.time = 11;
  assert.deepEqual(buyPlan(h, 'void'), {cost:550, consumed:[0,1]});
  assert.equal(m.order(0, { o:'buy', id:'void' }), null);
  assert.equal(h.maxMana, 680);
  assert.equal(h.stats.manaRegen, 4.3);
  assert.equal(spellDamage(h, HEROES.orrin.abilities[0]), 126);
  assert.equal(sellValue(h.inventory[0], m.time), 550 + 650 + 225);
  assert.equal(m.order(0, { o:'cast', i:0, x:650, y:450 }), null);
  assert.ok(Math.abs(h.cd[0] - m.time - 4.8) < 1e-8);
});

test('War Horn requires allied creeps and consumes cooldown only on a successful rally', () => {
  const m = new Match({ bots:[null,null] });
  const h = m.heroes[0];
  h.gold = 1400;
  m.order(0, { o:'buy', id:'horn' });
  const rally = { o:'item', i:0, x:650, y:450 };
  assert.match(m.order(0,rally), /allied creeps/);
  assert.equal(h.itemsReady.horn, undefined);
  m.spawn();
  assert.equal(m.order(0,rally), null);
  assert.equal(m.creeps.find(c => c.team === 0).hornUntil, 8);
  assert.equal(m.creeps.find(c => c.team === 1).hornUntil, undefined);
});

test('Might affects attacks only and ranged attacks keep their damage after launch', () => {
  const m = new Match({ heroes:['vesper','orrin'], bots:[null,null] });
  const [archer,target] = m.heroes;
  Object.assign(archer, {x:2200, y:450});
  Object.assign(target, {x:2500, y:450});
  m.order(1, {o:'stop'});
  m.orb = {kind:'Might', x:archer.x, y:archer.y};
  advance(m,.05);
  assert.equal(archer.stats.multiplier, 1.6);
  assert.equal(spellDamage(archer, HEROES.vesper.abilities[0]), 80);
  m.order(0, {o:'attack', id:target.id});
  advance(m,.35);
  assert.equal(m.projectiles.length, 1);
  assert.equal(m.projectiles[0].damage, 47 * 1.6);
  archer.buffs.length = 0;
  advance(m,.5);
  assert.ok(Math.abs(target.hp - (target.maxHp - 47 * 1.6 * physical(target.armor))) < 1);
});

test('denies, experience, protected objectives, and core destruction', () => {
  const m = new Match({ bots: [null, null] });
  const [hero, foe] = m.heroes;
  m.spawn();
  const own = m.creeps.find(c => c.team === 0);
  Object.assign(foe, { x: own.x + 150, y: own.y });
  own.hp = 1;
  m.attackHit(hero, own);
  assert.equal(hero.gold, 600);
  assert.equal(foe.xp, 18);
  const core = m.getBuilding(1, 'core'), outer = m.getBuilding(1, 'outer'), inner = m.getBuilding(1, 'inner');
  assert.equal(m.hurt(core, 50_000, hero), 0);
  assert.equal(m.hurt(outer, 50_000, hero, { ability: true }), 0);
  m.hurt(outer, 50_000, hero);
  m.hurt(inner, 50_000, hero);
  m.hurt(core, 50_000, hero);
  assert.equal(hero.gold, 960);
  assert.equal(m.mode, 'ended');
  assert.equal(m.winner, 0);
});

test('spells respect unlock levels, mana, and cooldowns for all three heroes', () => {
  for (const hero of Object.keys(HEROES)) {
    const m = new Match({ heroes:[hero,'brakk'], bots:[null,null] });
    const h = m.heroes[0];
    assert.match(m.order(0, { o:'cast', i:1, x:650, y:450 }), /level 2/);
    assert.equal(m.order(0, { o:'cast', i:0, x:650, y:450 }), null);
    assert.equal(h.mana, h.maxMana - HEROES[hero].abilities[0].mana);
    advance(m, 1);
    assert.match(m.order(0, { o:'cast', i:0, x:650, y:450 }), /cooling/);
  }
});

test('recall is interrupted by an order and completes after three seconds when uninterrupted', () => {
  const m = new Match({ bots: [null, null] });
  const h = m.heroes[0];
  Object.assign(h, { x: 1700, y: 650 });
  assert.equal(m.order(0, { o:'recall' }), null);
  advance(m, 1);
  m.order(0, { o:'stop' });
  advance(m, 3);
  assert.equal(h.x, 1700);
  assert.equal(m.order(0, { o:'recall' }), null);
  advance(m, 3.1);
  assert.equal(h.x, 110);
  assert.match(m.order(0, { o:'recall' }), /cooling/);
});

test('normal opponent closes out an unattended match', () => {
  const m = new Match({ heroes: ['brakk', 'orrin'], bots: [null, 'normal'], seed: 17 });
  advance(m, 20 * 60);
  assert.equal(m.winner, 1);
});

test('seeded normal bots can reach a decisive late game', () => {
  const m = new Match({ heroes: ['brakk', 'orrin'], bots: ['normal', 'normal'], seed: 88 });
  advance(m, 40 * 60);
  assert.equal(m.mode, 'ended');
  assert.ok(m.winner === 0 || m.winner === 1);
});
