(function () {
  const rules = typeof module === 'object' ? require('./rules.json') : globalThis.LanebreakRules;
  const { HEROES, ITEMS, CREEPS, WIDTH, HEIGHT, UNLOCKS, WEAVE_MARKS } = rules;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const range = (a, b) => distance(a, b) - b.r;
  const xpGoal = level => 200 + 100 * (level - 1);
  const baseMana = (hero, spell) => spell.mana + (spell.manaPercent || 0) * (hero.maxMana || 0);
  const manaPerUnit = (hero, spell) => (spell.distanceMana || 0) + (spell.distanceManaPercent || 0) * (hero.maxMana || 0);
  const owns = (object, id) => Object.hasOwn(object, id);
  const isVeiled = (unit, time) => unit.veilUntil > time;
  const CREEP_FLAGS = { stunned: 1, rallied: 2, deniable: 4, spirit: 8, lifted: 16, rooted: 32 };
  const MISSED_REFRESH_MS = 32;
  const LONG_FRAME_MS = 50;
  const PRESSURE_WINDOW_MS = 2000;
  const RECOVERY_MS = 5000;
  const REDUCED_FRAME_MS = 1000 / 30;

  class PresentationPacer {
    constructor() {
      this.reset();
    }
    reset() {
      this.lastCallback = null;
      this.burstStart = 0;
      this.pressure = 0;
      this.recoverAt = 0;
      this.nextDraw = 0;
    }
    get reduced() {
      return this.recoverAt !== 0;
    }
    shouldDraw(now, enabled) {
      if (!enabled) {
        if (this.lastCallback !== null) this.reset();
        return true;
      }
      const gap = this.lastCallback === null ? 0 : now - this.lastCallback;
      this.lastCallback = now;
      if (now - this.burstStart > PRESSURE_WINDOW_MS) this.pressure = 0;
      // Wait for a burst so an isolated browser stall does not reduce the frame rate.
      if (gap >= MISSED_REFRESH_MS) {
        if (!this.pressure) this.burstStart = now;
        const long = gap >= LONG_FRAME_MS;
        this.pressure += long ? 2 : 1;
        if (this.pressure >= 6 || (this.reduced && long)) {
          this.recoverAt = now + RECOVERY_MS;
          this.pressure = 0;
        }
      }
      if (!this.reduced) return true;
      if (now >= this.recoverAt) {
        this.recoverAt = 0;
        this.nextDraw = 0;
        return true;
      }
      if (now < this.nextDraw - 1) return false;
      this.nextDraw = this.nextDraw && now - this.nextDraw < REDUCED_FRAME_MS ?
        this.nextDraw + REDUCED_FRAME_MS : now + REDUCED_FRAME_MS;
      return true;
    }
  }
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
    if (['unit', 'dagger', 'pounce'].includes(spell.kind)) return 'unit';
    return (spell.kind === 'blast' ? spell.range > 0 : ['bolt', 'hook', 'dash', 'blink', 'spirit', 'meteor', 'sweep', 'brand', 'brandReturn'].includes(spell.kind)) ?
      'point' : 'self';
  }
  const abilityNeedsTarget = spell => abilityCastMode(spell) !== 'self';
  function abilityReadyAt(hero, i) {
    if (i >= 4) return hero.weaveReady?.[hero.prepared?.[i - 4]] || 0;
    if (i === 3 && hero.prepared?.includes(weaveRecipe(hero))) return 0;
    if (i === 3 && hero.brandChargeReady) return Math.min(...hero.brandChargeReady);
    return hero.cd[i];
  }
  function abilityError(hero, i, time, spell = abilitySpell(hero, i), freeMana = false, noCooldowns = freeMana) {
    if (!spell) return 'Invalid ability';
    const level = abilityLevel(hero, i);
    if (hero.level < level) return 'Unlocks at level ' + level;
    if (spell.kind === 'passive') return 'This ability is passive';
    if (hero.silenced) return 'Unable to cast while silenced';
    if (spell.kind === 'brandReturn' && !hero.brands?.some(brand => brand.until > time)) return 'Place a fire brand with R first';
    if (spell.kind === 'brand' && abilityReadyAt(hero, i) > time) return 'No fire brand charges ready';
    if (spell.kind === 'invoke' && !weaveRecipe(hero)) return 'Queue three marks with Q, W, or E';
    if (!noCooldowns && abilityReadyAt(hero, i) > time) return 'Ability cooling down';
    if (spell.kind === 'prepared') return 'Prepare a spell with R first';
    if (!freeMana && hero.mana < baseMana(hero, spell)) return 'Not enough mana';
    return null;
  }
  function point(unit, x, y, limit = Infinity, min = 0, ground = true, height = HEIGHT) {
    const length = Math.hypot(x - unit.x, y - unit.y) || 1;
    const factor = clamp(length, min, limit) / length;
    return { x: clamp(unit.x + (x - unit.x) * factor, ground ? 30 : 20, WIDTH - (ground ? 30 : 20)),
      y: clamp(unit.y + (y - unit.y) * factor, ground ? 70 : 20, height - (ground ? 140 : 20)) };
  }
  function castPoint(hero, spell, x, y, height = HEIGHT, freeMana = false) {
    if (spell.fixed || spell.kind === 'bolt' || spell.kind === 'hook') {
      const angle = spell.fixed || (x === hero.x && y === hero.y) ? hero.facing : Math.atan2(y - hero.y, x - hero.x);
      x = hero.x + Math.cos(angle) * spell.range;
      y = hero.y + Math.sin(angle) * spell.range;
      if (spell.kind === 'bolt' || spell.kind === 'hook') return { x, y };
    }
    const min = spell.kind === 'dash' && !spell.dashInvulnerable ? 60 : 0;
    const end = point(hero, x, y, spell.range, min, spell.kind !== 'blast', height);
    if (spell.distanceManaPercent && !freeMana) {
      const affordable = Math.max(0, (hero.mana - baseMana(hero, spell)) / manaPerUnit(hero, spell));
      return point(hero, end.x, end.y, affordable, 0, true, height);
    }
    return end;
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
  function shopOffer(hero, id, canShop) {
    const plan = buyPlan(hero, id);
    let reason = null;
    if (!canShop) reason = 'Return to your fountain to buy items';
    else if (hero.inventory.length - plan.consumed.length >= 6) reason = 'Inventory full';
    else if (hero.gold + 1e-6 < plan.cost) reason = 'Need ' + Math.ceil(plan.cost - hero.gold) + ' more gold';
    return { ...plan, reason };
  }
  function pickTarget(snapshot, team, point, includeAlliedCreeps = false) {
    if (snapshot.mode !== 'match' || snapshot.heroes[team].hp <= 0) return null;
    return pickUnit(snapshot, point, snapshot.heroes[team].team, includeAlliedCreeps);
  }
  const targetableUnit = (caster, target, spell, time) => {
    if (target.hp <= 0 || target.concealed || target.cycloneUntil > time || target.sweepOrigin || target.currentRunOrigin) return false;
    const allied = caster.team === target.team;
    const allowed = spell.target === 'otherUnit' ? caster.id !== target.id :
      spell.target === 'ally' ? allied : !allied || (spell.target === 'selfOrEnemy' && caster.id === target.id);
    return allowed && (allied || !(target.veiled || isVeiled(target, time))) && range(caster, target) <= spell.range;
  };
  function pickSpellTarget(snapshot, caster, spell, at) {
    let best = null, nearest = Infinity;
    function consider(target, height) {
      if (!targetableUnit(caster, target, spell, snapshot.time)) return;
      const d = Math.hypot(target.x - at.x, Math.max(target.y - height - at.y, at.y - target.y, 0));
      if (d <= target.r + 12 && d < nearest) {
        best = target;
        nearest = d;
      }
    }
    for (const hero of snapshot.heroes) {
      consider(hero, (hero.dummy ? 28 : 18) + (hero.lifted ? 22 : 0));
    }
    if (spell.target === 'enemyUnit' || spell.target === 'otherUnit') {
      for (const [id, team, kind, x, y, hp, , , r, , flags] of snapshot.creeps) {
        consider({id, team, x, y, hp, r:r ?? CREEPS[kind].r}, flags & CREEP_FLAGS.lifted ? 19 : 3);
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
  const api = { buyPlan, shopOffer, sellValue, spellDamage, baseMana, manaPerUnit, abilityLevel, abilitySpell, abilityError, abilityReadyAt,
    abilityCastMode, abilityNeedsTarget, castPoint, weaveRecipe, pickTarget, pickUnit, pickSpellTarget, CREEP_FLAGS, xpGoal,
    PresentationPacer };
  if (typeof module === 'object') module.exports = api;
  else globalThis.Lanebreak = { ...globalThis.LanebreakMatch, ...api };
})();
