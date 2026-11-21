const test = require('node:test');
const assert = require('node:assert/strict');
const { Match, buyPlan, sellValue, spellDamage, physical, pickTarget, pickUnit, pickSpellTarget, abilityCastMode,
  abilityNeedsTarget, castPoint, CREEP_FLAGS } = require('../src/engine.js');
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
    assert.equal(pickTarget(m.snapshot(team), team, creep, true).id, creep.id);
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

test('attack orders draw and transfer lane creep aggro before an attack hits', () => {
  const m = new Match({ bots:[null,null], seed:4 });
  m.spawn();
  const [hero, foe] = m.heroes;
  const ally = m.creeps.find(c => c.team === 0);
  const [creep, outside] = m.creeps.filter(c => c.team === 1);
  Object.assign(hero,{x:2450,y:450});
  Object.assign(foe,{x:3650,y:450});
  Object.assign(ally,{x:2300,y:450});
  Object.assign(creep,{x:2480,y:450,target:ally.id,windup:{target:ally.id,time:1}});
  Object.assign(outside,{x:3050,y:450});
  const hitHero = {o:'attack',id:foe.id};
  const clickAlly = {o:'attack',id:ally.id};
  assert.equal(m.order(0,hitHero),null);
  assert.equal(creep.target,hero.id);
  assert.equal(creep.windup,null);
  assert.equal(outside.target,undefined);
  assert.equal(foe.hp,foe.maxHp);
  assert.equal(creep.forcedUntil,2.3);
  creep.windup = {target:hero.id,time:1};
  assert.equal(m.order(0,clickAlly),null);
  assert.equal(creep.target,ally.id);
  assert.equal(creep.windup,null);
  assert.equal(hero.order.o,'stop');
  assert.equal(ally.hp,ally.maxHp);
  m.order(0,hitHero);
  assert.equal(creep.target,ally.id);
  m.time = 3;
  m.order(0,hitHero);
  assert.equal(creep.target,hero.id);
  ally.hp = ally.maxHp / 2 - 1;
  m.order(0,clickAlly);
  assert.equal(creep.target,ally.id);
  assert.deepEqual(hero.order,clickAlly);
});

test('recipe view follows the same nested slot allocation as the purchase', () => {
  const h = new Match().heroes[0];
  h.inventory = [{id:'stone'}];
  const partial = buyPlan(h,'executioner',true);
  assert.deepEqual(partial.consumed,[0]);
  assert.equal(partial.cost,ITEMS.executioner.total - ITEMS.stone.cost);
  assert.deepEqual(partial.recipe.parts.map(node=>node.id),['greatblade','gloves']);
  assert.deepEqual(partial.recipe.parts[0].parts.map(node=>[node.id,node.owned]),[['stone',true],['stone',false]]);
  h.inventory.push({id:'greatblade'});
  const assembled = buyPlan(h,'executioner',true);
  assert.deepEqual(assembled.consumed,[1]);
  assert.deepEqual(assembled.recipe.parts[0],{id:'greatblade',owned:true,parts:[]});
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

test('standard spells respect unlock levels, mana, and cooldowns', () => {
  for (const hero of Object.keys(HEROES)) {
    if (HEROES[hero].weaves) continue;
    const m = new Match({ heroes:[hero,'brakk'], bots:[null,null] });
    const h = m.heroes[0];
    if (!HEROES[hero].unlocks) assert.match(m.order(0, { o:'cast', i:1, x:650, y:450 }), /level 2/);
    assert.equal(m.order(0, { o:'cast', i:0, x:650, y:450 }), null);
    assert.equal(h.mana, h.maxMana - HEROES[hero].abilities[0].mana);
    advance(m, 1);
    assert.match(m.order(0, { o:'cast', i:0, x:650, y:450 }), /cooling/);
  }
});

test('hero stats update on equipment changes and temporary buff expiration', () => {
  const match = new Match({ heroes:['vesper','brakk'], bots:[null,null] });
  const hero = match.heroes[0];
  match.gainXp(hero, 500);
  const speed = hero.stats.speed, haste = hero.stats.haste;
  assert.equal(match.order(0, { o:'buy', id:'boots' }), null);
  assert.equal(hero.stats.speed, speed + 50);
  assert.equal(match.order(0, { o:'cast', i:2, x:hero.x, y:hero.y }), null);
  advance(match, .1);
  assert.ok(hero.stats.speed > speed + 50);
  assert.equal(hero.stats.haste, haste + .5);
  advance(match, HEROES.vesper.abilities[2].duration);
  assert.equal(hero.stats.speed, speed + 50);
  assert.equal(hero.stats.haste, haste);
  assert.equal(match.order(0, { o:'sell', i:0 }), null);
  assert.equal(hero.stats.speed, speed);
});

test('aimed abilities and instant abilities are classified across the roster', () => {
  const expected = {
    vesper:[true, true, false, true], brakk:[true, false, false, false], orrin:[true, true, true, true],
    sable:[true, true, false, true], mirel:[true, true, false, true], neris:[false, false, false, false],
    cairn:[false, false, false, false], ecarg:[true, true, false, true]
  };
  for (const [id, kit] of Object.entries(HEROES)) {
    assert.deepEqual(kit.abilities.slice(0, 4).map(abilityNeedsTarget), expected[id]);
  }
  for (const [recipe, spell] of Object.entries(HEROES.neris.weaves)) {
    assert.equal(abilityNeedsTarget(spell), recipe !== 'WWE' && recipe !== 'QQW');
  }
  assert.equal(abilityCastMode(HEROES.neris.weaves.QQQ), 'unit');
});

test('an aimed cast uses the previewed point and a stale Neris slot cannot cast a different spell', () => {
  const match = new Match({ heroes:['vesper','brakk'], training:{ dummy:false } });
  const vesper = match.heroes[0], click = { x:vesper.x + 50, y:vesper.y + 70 };
  const order = { o:'cast', i:1, ...click };
  assert.match(match.order(0, { ...order, castMode:'self' }), /Select the ability again/);
  assert.equal(match.areas.length, 0);
  assert.equal(match.order(0, { ...order, castMode:'point' }), null);
  const expected = castPoint(vesper,HEROES.vesper.abilities[1],click.x,click.y);
  assert.deepEqual({ x:match.areas[0].x, y:match.areas[0].y }, expected);

  const weaver = new Match({ heroes:['neris','brakk'], training:{ dummy:false } });
  const neris = weaver.heroes[0], destination = { x:neris.x + 365, y:neris.y };
  for (const i of [0, 1, 1, 3]) {
    assert.equal(weaver.order(0, { o:'cast', i, ...destination, castMode:'self' }), null);
  }
  const tornado = { o:'cast', i:4, ...destination };
  assert.match(weaver.order(0, { ...tornado, castMode:'self', recipe:'QQW' }), /Select the ability again/);
  assert.match(weaver.order(0, { ...tornado, castMode:'point', recipe:'EEE' }), /Select the ability again/);
  assert.equal(weaver.projectiles.length, 0);
  assert.equal(weaver.order(0, { ...tornado, castMode:'point', recipe:'QWW' }), null);
  assert.equal(weaver.projectiles[0].spell, HEROES.neris.weaves.QWW);
  assert.equal(neris.x, destination.x - 365);
});

test('Neris can prepare and cast all ten recipes at level one in any order', () => {
  assert.equal(Object.keys(HEROES.neris.weaves).length, 10);
  for (const [recipe, spell] of Object.entries(HEROES.neris.weaves)) {
    const match = new Match({ heroes:['neris','brakk'], bots:[null,null] });
    const [hero, enemy] = match.heroes;
    enemy.x = 600;
    const cast = i => match.order(0, i === 4 && spell.kind === 'unit' ?
      { o:'cast', i, id:enemy.id, castMode:'unit' } : { o:'cast', i, x:600, y:450 });
    assert.match(cast(3), /Queue three marks/);
    assert.match(match.order(0, { o:'cast', i:4, x:600, y:450 }), /Prepare a spell/);
    for (const key of [...recipe].reverse()) assert.equal(cast('QWE'.indexOf(key)), null);
    assert.equal(hero.mana, hero.maxMana);
    assert.equal(cast(3), null);
    assert.equal(hero.mana, hero.maxMana);
    assert.deepEqual(hero.prepared, [recipe]);
    assert.deepEqual(hero.marks, []);
    assert.equal(hero.cd[3], HEROES.neris.abilities[3].cd);
    assert.equal(cast(4), null);
    assert.equal(hero.mana, hero.maxMana - spell.mana);
    assert.equal(hero.weaveReady[recipe], spell.cd);
    if (spell.kind === 'blast' || spell.kind === 'meteor') assert.equal(match.areas[0].spell, spell);
    else if (spell.kind === 'bolt') assert.equal(match.projectiles[0].spell, spell);
    else if (spell.kind === 'unit') assert.equal(enemy.stitch.source, hero.id);
    else if (spell.kind === 'veil') assert.equal(hero.veilUntil, spell.duration);
    else if (spell.kind === 'sentry') assert.equal(match.creeps[0].sentry, true);
    else assert.equal(hero.buffs[0].id, spell.name);
  }
});

test('Neris preserves spell cooldowns when spells swap slots or are prepared again', () => {
  const match = new Match({ heroes:['neris','brakk'], bots:[null,null] });
  const hero = match.heroes[0];
  const cast = i => match.order(0, { o:'cast', i, x:600, y:450 });
  cast(0);
  cast(1);
  cast(1);
  assert.equal(cast(3), null);
  assert.equal(cast(4), null);
  cast(1);
  cast(1);
  cast(0);
  cast(2);
  assert.deepEqual(hero.marks, [1, 0, 2]);
  assert.match(cast(3), /cooling down/);
  match.time = hero.cd[3];
  hero.mana = 0;
  assert.equal(cast(3), null);
  assert.deepEqual(hero.prepared, ['QWE', 'QWW']);
  assert.match(cast(4), /Not enough mana/);
  assert.match(cast(5), /cooling down/);
  hero.mana = hero.maxMana;
  assert.equal(cast(4), null);
  assert.equal(match.projectiles.at(-1).spell.name, 'Spool Break');
  match.time = hero.cd[3];
  cast(2); cast(2); cast(2);
  assert.equal(cast(3), null);
  match.time = hero.cd[3];
  cast(1); cast(1); cast(0);
  assert.equal(cast(3), null);
  assert.deepEqual(match.snapshot(0).heroes[0].prepared, ['QWW', 'EEE']);
  assert.equal(match.snapshot(1).heroes[0].prepared, undefined);
  assert.match(cast(4), /cooling down/);
  assert.equal(cast(5), null);
});

test('Pin Stitch targets a hero by id, lands immediately, and staggers on later damage', () => {
  const match = new Match({ heroes:['neris','brakk'], training:{ dummy:true } });
  const [hero, dummy] = match.heroes, spells = HEROES.neris.weaves;
  const cast = { o:'cast', i:4, id:dummy.id, castMode:'unit', recipe:'QQQ' };
  for (const i of [0, 0, 0, 3]) assert.equal(match.order(0, { o:'cast', i, x:hero.x, y:hero.y }), null);
  assert.match(match.order(0, { ...cast, castMode:'point', x:dummy.x, y:dummy.y }), /Select the ability again/);
  assert.match(match.order(0, { ...cast, id:hero.id }), /enemy hero in range/);
  dummy.x += 300;
  assert.match(match.order(0, cast), /enemy hero in range/);
  dummy.x -= 300;
  dummy.liftUntil = match.time + 1;
  assert.equal(pickSpellTarget(match.snapshot(0), hero, spells.QQQ, { x:dummy.x, y:dummy.y - 55 }).id, dummy.id);
  assert.equal(match.training.hits, 0);
  assert.equal(match.order(0, cast), null);
  assert.equal(match.projectiles.length, 0);
  assert.equal(match.training.hits, 1);
  assert.ok(dummy.stunUntil > match.time);
  assert.equal(dummy.stitch.hits, 3);
  advance(match, .3);
  match.hurt(dummy,30,hero,{ attack:true });
  assert.ok(dummy.stunUntil > match.time);
  assert.equal(dummy.stitch.hits, 2);
  match.hurt(dummy,30,hero,{ attack:true });
  assert.equal(dummy.stitch.hits, 2);
  dummy.mana = 20;
  match.magic(dummy,hero,spells.WWW,40);
  assert.equal(dummy.mana, 0);
  const x = dummy.x;
  dummy.windup = { target:hero.id, time:match.time + 1 };
  match.magic(dummy,hero,spells.QWE,35);
  assert.equal(dummy.x, x);
  assert.equal(dummy.windup, null);
  assert.ok(dummy.disarmedUntil > match.time);
});

test('Spool Break pushes along its trajectory even when Neris moves after casting', () => {
  const match = new Match({ heroes:['neris','brakk'], bots:[null,null] });
  const [hero, enemy] = match.heroes;
  Object.assign(hero, { x:2100, y:450, order:{ o:'stop' } });
  Object.assign(enemy, { x:2460, y:480, order:{ o:'stop' } });
  for (const i of [0, 1, 2, 3, 4]) {
    assert.equal(match.order(0, { o:'cast', i, x:2600, y:450 }), null);
  }
  hero.y = 680;
  advance(match, .35);
  assert.equal(enemy.x, 2460 + HEROES.neris.weaves.QWE.push);
  assert.equal(enemy.y, 480);
  assert.ok(enemy.disarmedUntil > match.time);
});

test('WWQ sends a tornado that hits once and lifts the training dummy', () => {
  const match = new Match({ heroes:['neris','brakk'], training:{ dummy:true } });
  const [hero, dummy] = match.heroes;
  for (const i of [1, 1, 0, 3]) {
    assert.equal(match.order(0, { o:'cast', i, x:hero.x, y:hero.y, castMode:'self' }), null);
  }
  assert.equal(match.order(0, { o:'cast', i:4, x:dummy.x, y:dummy.y, castMode:'point', recipe:'QWW' }), null);
  assert.equal(match.snapshot(0).projectiles[0][9], 'wind');
  advance(match, .8);
  assert.equal(match.training.hits, 1);
  assert.equal(match.snapshot(0).heroes[1].lifted, true);
  assert.equal(dummy.stunUntil, dummy.liftUntil);
  advance(match, .8);
  assert.equal(match.training.hits, 1);
  assert.equal(match.snapshot(0).heroes[1].lifted, undefined);
});

test('QQW conceals Neris through movement and preparation, but spells and attacks reveal her', () => {
  const match = new Match({ heroes:['neris','brakk'], bots:[null,null] });
  const [hero, enemy] = match.heroes;
  Object.assign(hero, { x:2400, y:450 });
  Object.assign(enemy, { x:2420, y:350 });
  const cast = (i, castMode = 'self') => match.order(0, { o:'cast', i, x:enemy.x, y:enemy.y, castMode });
  for (const i of [0, 0, 1, 3, 4]) assert.equal(cast(i), null);
  assert.equal(match.snapshot(0).heroes[0].veiled, true);
  const hidden = match.snapshot(1).heroes[0];
  assert.equal(hidden.concealed, true);
  assert.equal(hidden.x, undefined);
  assert.equal(hidden.hp, undefined);
  assert.equal(match.order(1, { o:'attack', id:hero.id }), 'Invalid attack target');
  assert.equal(match.order(0, { o:'move', x:hero.x + 45, y:hero.y }), null);
  const x = hero.x;
  advance(match, .25);
  assert.ok(hero.x > x);
  assert.equal(match.snapshot(0).heroes[0].veiled, true);

  const hp = hero.hp;
  match.blast(enemy, HEROES.brakk.abilities[1], hero.x, hero.y, 40);
  assert.ok(hero.hp < hp);
  assert.equal(match.snapshot(1).effects.some(e => e.kind === 'hit'), false);
  match.time = hero.cd[3];
  for (const i of [1, 1, 0, 3]) assert.equal(cast(i), null);
  assert.equal(match.snapshot(0).heroes[0].veiled, true);
  assert.equal(cast(4, 'point'), null);
  assert.equal(match.snapshot(1).heroes[0].x, hero.x);

  match.time = hero.weaveReady.QQW;
  assert.equal(cast(5), null);
  assert.equal(match.order(0, { o:'attack', id:enemy.id }), null);
  match.updateHero(hero, 1 / 60);
  assert.equal(match.snapshot(1).heroes[0].concealed, undefined);
  match.time = hero.weaveReady.QQW;
  hero.mana = hero.maxMana;
  assert.equal(cast(5), null);
  match.time = hero.veilUntil;
  assert.equal(match.snapshot(1).heroes[0].concealed, undefined);
});

test('Needle Post fires and expires, and Emberfall rolls and keeps burning enemies it passes', () => {
  const match = new Match({ heroes:['neris','brakk'], training:{ dummy:true } });
  const [, dummy] = match.heroes;
  const cast = (i, x) => match.order(0, { o:'cast', i, x, y:dummy.y });
  const prepare = marks => {
    for (const mark of marks) assert.equal(cast('QWE'.indexOf(mark), dummy.x), null);
    assert.equal(cast(3, dummy.x), null);
  };
  prepare('QEE');
  assert.equal(cast(4, dummy.x - 100), null);
  const post = match.creeps[0];
  assert.ok(match.snapshot(0).creeps[0][10] & CREEP_FLAGS.sentry);
  const x = post.x;
  advance(match, 1.5);
  assert.equal(post.x, x);
  assert.ok(match.training.hits > 0);
  advance(match, 10);
  assert.equal(match.units.has(post.id), false);
  prepare('WEE');
  assert.equal(cast(4, dummy.x - 230), null);
  const area = match.areas[0], previousHits = match.training.hits;
  advance(match, .55);
  assert.equal(match.projectiles[0].x, area.x);
  assert.equal(match.training.hits, previousHits);
  advance(match, .4);
  assert.ok(match.projectiles[0].x > area.x);
  assert.equal(match.training.hits, previousHits + 1);
  assert.equal(match.snapshot(0).heroes[1].burning, true);
  advance(match, 2.5);
  assert.equal(match.training.hits, previousHits + 5);
  assert.equal(match.projectiles.length, 0);
  assert.equal(match.snapshot(0).heroes[1].burning, undefined);
});

test('bots can finish a weakened enemy Needle Post without treating it as a lane creep', () => {
  const match = new Match({ heroes:['neris','brakk'], bots:[null,null] });
  const [neris, brakk] = match.heroes;
  neris.x = 2000;
  brakk.x = 2670;
  const cast = i => match.order(0, { o:'cast', i, x:2600, y:450 });
  cast(0); cast(2); cast(2); cast(3);
  assert.equal(cast(4), null);
  const post = match.creeps[0];
  post.hp = 1;
  match.think(brakk);
  assert.deepEqual(brakk.order, { o:'attack', id:post.id });
});

test('Cairn casts all three fixed blasts along his existing facing and spends Heat on Furnace Vent', () => {
  const match = new Match({ heroes:['cairn','brakk'], bots:[null,null] });
  const hero = match.heroes[0], kit = HEROES.cairn;
  Object.assign(hero, { x:1350, y:500, facing:Math.PI });
  assert.match(match.order(0, { o:'cast', i:0, x:1550, y:500, castMode:'point' }), /Select the ability again/);
  for (const i of [0, 1, 2]) {
    assert.equal(match.order(0, { o:'cast', i, x:1550, y:510, castMode:'self' }), null);
  }
  assert.deepEqual(match.areas.map(area => area.x), [1115, 890, 650]);
  assert.equal(hero.facing, Math.PI);
  assert.ok(hero.cd.slice(0,3).every(cd => cd > match.time));
  hero.level = 6;
  match.spawn();
  match.spawn();
  match.spawn();
  const wave = match.creeps.filter(creep => creep.team === 1);
  match.kill(match.creeps.find(creep => creep.team === 0),hero,true);
  assert.equal(hero.heat, 0);
  for (const creep of wave) match.kill(creep,hero,false);
  assert.equal(hero.heat, kit.heat.max);
  advance(match, .03);
  assert.equal(hero.stats.damage, kit.damage + (hero.level - 1) * kit.damageGrowth + kit.heat.max * kit.heat.attack);
  hero.mana = hero.maxMana;
  const expected = spellDamage(hero, kit.abilities[3]);
  assert.equal(match.order(0, { o:'cast', i:3, x:1600, y:500 }), null);
  assert.equal(match.areas.at(-1).damage, expected);
  assert.equal(match.areas.at(-1).x, hero.x);
  assert.equal(hero.heat, 0);
  Object.assign(hero, { heat:5 });
  match.kill(hero,match.heroes[1],false);
  assert.equal(hero.heat, 2);
});

test('training has one stationary, invulnerable target and records real damage', () => {
  const match = new Match({ heroes:['vesper', 'brakk'], training:{ dummy:true } });
  const [hero, dummy] = match.heroes;
  const location = { x:dummy.x, y:dummy.y };
  const startingHealth = dummy.hp;
  assert.equal(hero.level, 15);
  assert.equal(match.units.size, 2);
  assert.deepEqual(match.buildings, []);
  assert.equal(match.order(1, { o:'attack', id:hero.id }), 'Invalid order');
  match.order(0, { o:'attack', id:dummy.id });
  advance(match, 4);
  assert.ok(match.training.hits > 0);
  assert.ok(match.training.damage > 0);
  assert.equal(dummy.hp, startingHealth);
  assert.deepEqual({ x:dummy.x, y:dummy.y }, location);
  assert.equal(hero.hp, hero.maxHp);

  match.order(0, { o:'stop' });
  const damageDealt = match.training.damage;
  assert.equal(match.hurt(dummy, 100_000, hero, { ability:true }), 75_000);
  assert.equal(match.training.damage, damageDealt + 75_000);
  assert.equal(dummy.hp, startingHealth);
  Object.assign(hero, { x:5080, y:450 });
  advance(match, 65);
  assert.equal(hero.hp, hero.maxHp);
  assert.equal(match.orb, null);
  assert.equal(match.creeps.length, 0);
  assert.equal(match.snapshot(0).heroes[1].dummy, true);
  assert.equal(match.mode, 'match');
});

test('empty training lets Neris cast repeatedly and automatically refills resources on the next step', () => {
  const match = new Match({ heroes:['neris', 'brakk'], training:{ dummy:false } });
  const [hero, dummy] = match.heroes;
  const cast = i => match.order(0, { o:'cast', i, x:hero.x + 500, y:hero.y });
  assert.equal(match.units.size, 1);
  assert.equal(pickTarget(match.snapshot(0), 0, dummy), null);
  assert.equal(match.canShop(hero), true);
  hero.mana = 0;
  cast(0); cast(1); cast(1);
  assert.equal(cast(3), null);
  assert.equal(cast(4), null);
  assert.equal(cast(4), null);
  cast(2); cast(2); cast(2);
  assert.equal(cast(3), null);
  assert.deepEqual(hero.prepared, ['EEE', 'QWW']);
  assert.equal(cast(4), null);
  assert.equal(cast(5), null);
  assert.equal(hero.mana, 0);
  assert.equal(hero.cd[3], 0);
  assert.deepEqual(hero.weaveReady, {});
  hero.hp = 1;
  hero.gold = 1;
  hero.itemsReady.rift = 90;
  hero.recallReady = 45;
  match.step(1 / 60);
  assert.equal(hero.mana, hero.maxMana);
  assert.equal(hero.hp, hero.maxHp);
  assert.equal(hero.gold, 20_000);
  assert.deepEqual(hero.itemsReady, {});
  assert.equal(hero.recallReady, 0);
  assert.deepEqual(hero.prepared, ['EEE', 'QWW']);
  assert.equal(match.training.hits, 0);
});

test('training with a dummy lets Cairn repeat standard abilities without mana or cooldowns', () => {
  const match = new Match({ heroes:['cairn', 'brakk'], training:{ dummy:true } });
  const [hero, dummy] = match.heroes;
  hero.mana = 0;
  for (const i of [0, 1, 2, 1, 1, 2]) {
    assert.equal(match.order(0, { o:'cast', i, x:dummy.x, y:dummy.y }), null);
  }
  assert.equal(match.areas.length, 6);
  assert.equal(hero.mana, 0);
  assert.deepEqual(hero.cd, [0, 0, 0, 0]);
  const heat = hero.heat;
  assert.equal(match.order(0, { o:'cast', i:3, x:dummy.x, y:dummy.y }), null);
  assert.equal(hero.heat, 0);
  match.step(1 / 60);
  assert.equal(hero.heat, heat);
});

test('Ecarg marks with Downbow and only an active Resonance boosts a follow-up', () => {
  const match = new Match({ heroes:['ecarg','brakk'], training:{ dummy:true } });
  const [hero, dummy] = match.heroes, [downbow, overtone] = HEROES.ecarg.abilities;
  const cast = i => match.order(0, { o:'cast', i, x:dummy.x, y:dummy.y, castMode:'point' });
  assert.equal(cast(0), null);
  advance(match, .5);
  assert.equal(match.snapshot(0).heroes[1].resonating, true);
  const damage = match.training.damage;
  assert.equal(cast(1), null);
  advance(match, .5);
  assert.equal(match.training.damage - damage, Math.round(spellDamage(hero,overtone) * (1 + overtone.accent)) * .75);
  assert.ok(dummy.stunUntil > match.time);
  assert.equal(match.snapshot(0).heroes[1].resonating, undefined);

  assert.equal(cast(0), null);
  advance(match, downbow.resonance + 1);
  assert.equal(match.snapshot(0).heroes[1].resonating, undefined);
  const expired = match.training.damage;
  assert.equal(cast(1), null);
  advance(match, .5);
  assert.equal(match.training.damage - expired, spellDamage(hero,overtone) * .75);
  assert.ok(dummy.stunUntil < match.time);
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
