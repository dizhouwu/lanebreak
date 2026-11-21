(function () {
  const rules = typeof module === 'object' ? require('./rules.json') : globalThis.LanebreakRules;
  const { HEROES, ITEMS, CREEPS, WIDTH, HEIGHT, UNLOCKS, WEAVE_MARKS } = rules;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const range = (a, b) => distance(a, b) - b.r;
  const xpGoal = level => 200 + 100 * (level - 1);
  const owns = (object, id) => Object.hasOwn(object, id);
  const isVeiled = (unit, time) => unit.veilUntil > time;
  const CREEP_FLAGS = { stunned: 1, rallied: 2, deniable: 4, sentry: 8, lifted: 16 };
  const spellDamage = (hero, spell) => spell.damage ? Math.round(
    (spell.damage + spell.growth * (hero.level - 1) + (spell.heatDamage || 0) * (hero.heat || 0)) * hero.stats.power
  ) : 0;
  const abilityLevel = (hero, i) => (HEROES[hero.hero].unlocks || UNLOCKS)[i];
  const weaveRecipe = hero => hero.marks?.length === WEAVE_MARKS ? [...hero.marks].sort().map(mark => 'QWE'[mark]).join('') : null;
  function abilitySpell(hero, i) {
    const kit = HEROES[hero.hero];
    if (i >= 4 && kit.weaves) return kit.weaves[hero.prepared?.[i - 4]] || kit.abilities[i];
    return kit.abilities[i];
  }
  function abilityCastMode(spell) {
    if (!spell || spell.fixed) return 'self';
    if (spell.kind === 'unit') return 'unit';
    return (spell.kind === 'blast' ? spell.range > 0 : ['bolt', 'dash', 'blink', 'sentry', 'meteor'].includes(spell.kind)) ?
      'point' : 'self';
  }
  const abilityNeedsTarget = spell => abilityCastMode(spell) !== 'self';
  const abilityReadyAt = (hero, i) => i >= 4 ? (hero.weaveReady?.[hero.prepared?.[i - 4]] || 0) : hero.cd[i];
  function abilityError(hero, i, time, spell = abilitySpell(hero, i), free = false) {
    if (!spell) return 'Invalid ability';
    const level = abilityLevel(hero, i);
    if (hero.level < level) return 'Unlocks at level ' + level;
    if (!free && abilityReadyAt(hero, i) > time) return 'Ability cooling down';
    if (spell.kind === 'prepared') return 'Prepare a spell with R first';
    if (spell.kind === 'invoke') {
      const recipe = weaveRecipe(hero);
      if (!recipe) return 'Queue three marks with Q, W, or E';
      if (hero.prepared[0] === recipe) return 'That spell is already in D';
    }
    if (!free && hero.mana < spell.mana) return 'Not enough mana';
    return null;
  }
  function point(unit, x, y, limit = Infinity, min = 0, ground = true) {
    const length = Math.hypot(x - unit.x, y - unit.y) || 1;
    const factor = clamp(length, min, limit) / length;
    return { x: clamp(unit.x + (x - unit.x) * factor, ground ? 30 : 20, WIDTH - (ground ? 30 : 20)),
      y: clamp(unit.y + (y - unit.y) * factor, ground ? 70 : 20, ground ? 860 : HEIGHT - 20) };
  }
  function castPoint(hero, spell, x, y) {
    if (spell.fixed || spell.kind === 'bolt') {
      const angle = spell.fixed || (x === hero.x && y === hero.y) ? hero.facing : Math.atan2(y - hero.y, x - hero.x);
      x = hero.x + Math.cos(angle) * spell.range;
      y = hero.y + Math.sin(angle) * spell.range;
      if (spell.kind === 'bolt') return { x, y };
    }
    return point(hero, x, y, spell.range, spell.kind === 'dash' ? 60 : 0, spell.kind !== 'blast');
  }
  function buyPlan(hero, id, showRecipe = false) {
    if (!owns(ITEMS, id)) return null;
    const consumed = [];
    function price(key, branch, root = false) {
      const node = branch && { id: key, owned: false, parts: [] };
      if (node) branch.push(node);
      const slot = hero.inventory.findIndex((item, i) => item.id === key && !consumed.includes(i));
      if (!root && slot >= 0) {
        consumed.push(slot);
        if (node) node.owned = true;
        return 0;
      }
      const item = ITEMS[key];
      return item.cost + (item.parts || []).reduce((sum, part) => sum + price(part, node?.parts), 0);
    }
    const tree = showRecipe ? [] : null;
    const cost = price(id, tree, true);
    return tree ? { cost, consumed, recipe: tree[0] } : { cost, consumed };
  }
  function sellValue(item, time) {
    return time - item.at <= 10 ? item.spent : Math.floor(ITEMS[item.id].total / 2);
  }
  function shopOffer(hero, id, time, canShop) {
    const plan = buyPlan(hero, id);
    let reason = null;
    if (!canShop) reason = 'Return to your fountain to buy items';
    else if (id === 'potion' && hero.pots >= 5) reason = 'Potion limit reached';
    else if (id === 'tome' && hero.level >= 15) reason = 'Maximum level reached';
    else if (id === 'tome' && hero.tomeReady > time) reason = 'Restocks in ' + Math.ceil(hero.tomeReady - time) + 's';
    else if (id !== 'potion' && id !== 'tome' && hero.inventory.length - plan.consumed.length >= 6) reason = 'Inventory full';
    else if (hero.gold + 1e-6 < plan.cost) reason = 'Need ' + Math.ceil(plan.cost - hero.gold) + ' more gold';
    return { ...plan, reason };
  }
  function pickTarget(snapshot, team, point, includeAlliedCreeps = false) {
    if (snapshot.mode !== 'match' || snapshot.heroes[team].hp <= 0) return null;
    return pickUnit(snapshot, point, team, includeAlliedCreeps);
  }
  const targetableHero = (caster, target, spell, time) => target?.type === 'hero' && target.team !== caster.team &&
    target.hp > 0 && !isVeiled(target, time) && range(caster, target) <= spell.range;
  function pickSpellTarget(snapshot, caster, spell, at) {
    let best = null, nearest = Infinity;
    for (const target of snapshot.heroes) {
      if (!targetableHero(caster, target, spell, snapshot.time)) continue;
      const height = (target.dummy ? 28 : 18) + (target.lifted ? 22 : 0);
      const d = Math.hypot(target.x - at.x, Math.max(target.y - height - at.y, at.y - target.y, 0));
      if (d <= target.r + 12 && d < nearest) {
        best = target;
        nearest = d;
      }
    }
    return best;
  }
  function pickUnit(snapshot, point, attackTeam, includeAlliedCreeps = false) {
    let best = null, nearest = Infinity;
    function consider(id, side, x, y, r, height) {
      const d = Math.min(Math.hypot(x - point.x, y - point.y), Math.hypot(x - point.x, y - height - point.y));
      if (d > r + 12 || d >= nearest) return;
      nearest = d;
      best = { id, team: side, x, y, r };
    }
    for (const h of snapshot.heroes) {
      if (h.team !== attackTeam && h.hp > 0) consider(h.id, h.team, h.x, h.y, h.r, 18);
    }
    for (const b of snapshot.buildings) {
      if (b.hp > 0 && b.team !== attackTeam && (attackTeam == null || !b.protected)) consider(b.id, b.team, b.x, b.y, b.r, 44);
    }
    for (const [id, side, kind, x, y, hp, , , radius, , flags] of snapshot.creeps) {
      if (hp > 0 && (side !== attackTeam || includeAlliedCreeps || flags & CREEP_FLAGS.deniable)) {
        consider(id, side, x, y, radius ?? CREEPS[kind].r, 3);
      }
    }
    return best;
  }
  const api = { buyPlan, shopOffer, sellValue, spellDamage, abilityLevel, abilitySpell, abilityError, abilityReadyAt,
    abilityCastMode, abilityNeedsTarget, castPoint, weaveRecipe, pickTarget, pickUnit, pickSpellTarget, CREEP_FLAGS, xpGoal };
  if (typeof module === 'object') module.exports = api;
  else globalThis.Lanebreak = { ...globalThis.LanebreakMatch, ...api };
})();
