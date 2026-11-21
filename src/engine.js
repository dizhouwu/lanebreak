(function () {
  const rules = typeof module === 'object' ? require('./rules.js') : globalThis.LanebreakRules;
  const { HEROES, ITEMS, CREEPS, DIFF, WIDTH, HEIGHT, ORBS, UNLOCKS, WEAVE_MARKS, TEAM } = rules;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const range = (a, b) => distance(a, b) - b.r;
  const home = team => ({ x: team ? WIDTH - 110 : 110, y: 450 });
  const TRAINING_START = { x:WIDTH / 2 - 420, y:450 };
  const TRAINING_GOLD = 20_000;
  const physical = armor => 1 - .06 * armor / (1 + .06 * Math.abs(armor));
  const xpGoal = level => 200 + 100 * (level - 1);
  const owns = (object, id) => Object.hasOwn(object, id);
  const CREEP_FLAGS = { stunned: 1, rallied: 2, deniable: 4, sentry: 8 };
  const CREEP_AGGRO_RANGE = 500;
  const CREEP_AGGRO_TIME = 2.3;
  const CREEP_AGGRO_COOLDOWN = 3;
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
  function abilityNeedsTarget(spell) {
    return Boolean(spell && (spell.kind === 'blast' ? spell.range > 0 :
      ['bolt', 'dash', 'blink', 'sentry'].includes(spell.kind)));
  }
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
  function randomGenerator(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let v = Math.imul(seed ^ seed >>> 15, 1 | seed);
      v = (v + Math.imul(v ^ v >>> 7, 61 | v)) ^ v;
      return ((v ^ v >>> 14) >>> 0) / 4294967296;
    };
  }
  function point(unit, x, y, limit = Infinity, min = 0, ground = true) {
    const length = Math.hypot(x - unit.x, y - unit.y) || 1;
    const factor = clamp(length, min, limit) / length;
    return { x: clamp(unit.x + (x - unit.x) * factor, ground ? 30 : 20, WIDTH - (ground ? 30 : 20)),
      y: clamp(unit.y + (y - unit.y) * factor, ground ? 70 : 20, ground ? 860 : HEIGHT - 20) };
  }
  function castPoint(hero, spell, x, y) {
    if (spell.fixed || spell.kind === 'bolt') {
      const angle = x === hero.x && y === hero.y ? hero.facing : Math.atan2(y - hero.y, x - hero.x);
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
  function refresh(h, now) {
    const d = HEROES[h.hero], lv = h.level - 1;
    const s = { hp: d.hp + lv * d.hpGrowth, mana: d.mana + lv * d.manaGrowth, damage: d.damage + lv * d.damageGrowth,
      armor: d.armor + lv * d.armorGrowth, speed: d.speed, regen: d.regen + lv * .15, manaRegen: d.manaRegen + lv * .08,
      haste: 1 + lv * d.speedGrowth, life: 0, power: 1, move: 1, multiplier: 1 };
    if (d.heat) s.damage += h.heat * d.heat.attack;
    const strongest = {};
    for (const slot of h.inventory) {
      for (const [key, value] of Object.entries(ITEMS[slot.id].stats || {})) {
        if (['speed', 'cdr', 'splash', 'crit', 'chill', 'reflect', 'recover'].includes(key)) {
          strongest[key] = Math.max(strongest[key] || 0, value);
        } else s[key] += value;
      }
    }
    for (const [key, value] of Object.entries(strongest)) s[key] = (s[key] || 0) + value;
    for (const buff of h.buffs) {
      if (buff.until > now) {
        for (const [key, value] of Object.entries(buff.stats)) s[key] = (s[key] || 0) + value;
      }
    }
    s.speed *= s.move;
    h.maxHp = s.hp;
    h.maxMana = s.mana;
    h.armor = s.armor;
    h.stats = s;
  }

  class Match {
    constructor({ heroes = ['brakk', 'orrin'], names = [], bots = [null, 'normal'], seed = Date.now(), training = null } = {}) {
      this.time = 0;
      this.mode = 'match';
      this.winner = null;
      this.endReason = null;
      this.nextId = 1;
      this.wave = 0;
      this.nextWave = 2;
      this.nextOrb = 60;
      this.orb = null;
      this.units = new Map();
      this.creeps = [];
      this.buildings = [];
      this.projectiles = [];
      this.areas = [];
      this.effects = [];
      this.nextEffect = 0;
      this.random = randomGenerator(seed);
      this.kills = [0, 0];
      this.training = training ? { dummy:training.dummy !== false, damage:0, hits:0, lastHit:0 } : null;
      this.heroes = heroes.map((key, team) => {
        const hero = owns(HEROES, key) ? key : 'brakk';
        const spec = HEROES[hero];
        const h = this.unit({ type: 'hero', team, hero, name: names[team] || spec.name, ...home(team), r: 26,
          level: 1, xp: 0, gold: 600, inventory: [], pots: 0, buffs: [], cd: [0, 0, 0, 0],
          ...(spec.weaves && { marks: [], prepared: [], weaveReady: {} }),
          ...(spec.heat && { heat: 0 }),
          itemsReady: {}, recallReady: 0, tomeReady: 0, lastThreat: -Infinity, recentAggro: -Infinity,
          bot: bots[team], think: this.random() * .3, buildIndex: 0, sway: 0, deaths: 0, lastHits: 0, denies: 0 });
        refresh(h, 0);
        h.hp = h.maxHp;
        h.mana = h.maxMana;
        return h;
      });
      if (this.training) {
        const [player, dummy] = this.heroes;
        Object.assign(player, TRAINING_START, { level:15, bot:null, order:{ o:'stop' } });
        Object.assign(dummy, { x:WIDTH / 2 + 150, y:450, name:'Training dummy', r:32, armor:0, bot:null, dummy:true });
        if (!this.training.dummy) {
          dummy.hp = 0;
          this.units.delete(dummy.id);
        }
        this.refillTraining();
        return;
      }
      for (const team of [0, 1]) {
        for (const b of [
          { kind: 'outer', x: 1850, y: 330, r: 44, hp: 1300, armor: 12, damage: 95 },
          { kind: 'inner', x: 1150, y: 330, r: 44, hp: 1600, armor: 12, damage: 125 },
          { kind: 'core', x: 520, y: 450, r: 70, hp: 3000, armor: 14, damage: 0 }
        ]) {
          this.buildings.push(this.unit({ type: 'building', team, ...b, x: team ? WIDTH - b.x : b.x, maxHp: b.hp, range: 560, interval: 1 }));
        }
      }
    }
    unit(props) {
      const unit = { id: this.nextId++, attackReady: 0, stunUntil: 0, slows: [], vx: 0, vy: 0, facing: props.team ? Math.PI : 0, ...props };
      this.units.set(unit.id, unit);
      return unit;
    }
    effect(kind, x, y, props = {}) {
      this.effects.push({ id: ++this.nextEffect, time: this.time, kind, x, y, ...props });
    }
    notice(team, text) {
      this.effect('notice', 0, 0, { audience: team, text });
    }
    refillTraining() {
      if (!this.training || this.mode !== 'match') return;
      const hero = this.heroes[0];
      const kit = HEROES[hero.hero];
      if (kit.heat) hero.heat = kit.heat.max;
      refresh(hero, this.time);
      hero.hp = hero.maxHp;
      hero.mana = hero.maxMana;
      hero.gold = Math.max(hero.gold, TRAINING_GOLD);
      hero.itemsReady = {};
      hero.recallReady = 0;
    }
    getBuilding(team, kind) {
      return this.buildings.find(b => b.team === team && b.kind === kind);
    }
    protected(unit) {
      return unit.type === 'building' && unit.kind !== 'outer' &&
        this.getBuilding(unit.team, unit.kind === 'inner' ? 'outer' : 'inner').hp > 0;
    }
    spawn() {
      const n = this.wave++;
      const rows = n < 24 ? [-60, 0, 60] : [-75, -25, 25, 75];
      const siege = n > 0 && n % (n >= 40 ? 1 : n >= 24 ? 2 : 5) === 0;
      for (const team of [0, 1]) {
        const boost = this.getBuilding(1 - team, 'inner').hp <= 0 ? 1.5 : 1;
        const spawn = (kind, back, dy) => {
          const base = CREEPS[kind];
          const hp = base.hp * (1 + .035 * n) * boost;
          const x = 650 - back, laneY = 450 + dy;
          this.creeps.push(this.unit({ ...base, kind, type: 'creep', team, x: team ? WIDTH - x : x,
            y: laneY, laneY, hp, maxHp: hp, r: base.r * (boost > 1 ? 1.15 : 1),
            damage: (base.damage + .6 * n) * boost, gold: base.gold + Math.floor(.7 * n),
            xp: base.xp + 1.5 * n, roll: [this.random(), this.random()], attackReady: this.time + this.random() * .5, scan: 0 }));
        };
        for (const dy of rows) spawn('melee', 0, dy);
        spawn('ranged', 90, -40);
        if (siege) spawn('siege', 150, 40);
      }
    }
    gainXp(hero, amount) {
      if (hero.level >= 15) return;
      hero.xp += amount;
      while (hero.level < 15 && hero.xp >= xpGoal(hero.level)) {
        const hp = hero.maxHp, mana = hero.maxMana;
        hero.xp -= xpGoal(hero.level);
        hero.level++;
        refresh(hero, this.time);
        if (hero.hp > 0) hero.hp += hero.maxHp - hp;
        hero.mana += hero.maxMana - mana;
        this.effect('level', hero.x, hero.y, { team: hero.team, text: 'LEVEL ' + hero.level });
      }
      if (hero.level === 15) hero.xp = 0;
    }
    hurt(target, amount, source, { ability = false, attack = false } = {}) {
      if (target.hp <= 0 || amount <= 0 || this.protected(target)) return 0;
      const raw = amount;
      if (target.type === 'building') {
        if (ability) return 0;
        amount *= source.type === 'creep' ? (source.kind === 'siege' ? 1.5 : .5) : .75;
      }
      amount *= ability ? (target.type === 'hero' ? .75 : 1) : physical(target.armor);
      if (target.type === 'hero' && source.team !== target.team && (source.type === 'hero' || source.type === 'building')) {
        target.lastThreat = this.time;
        target.potionUntil = 0;
        if (source.type === 'hero') source.recentAggro = this.time;
      }
      if (target.dummy) {
        this.training.damage += amount;
        this.training.lastHit = amount;
        this.training.hits++;
      } else target.hp -= amount;
      if (target.type === 'hero' || source.type === 'hero') this.effect('hit', target.x, target.y, {
        team: source.team, audience: source.type === 'hero' || source.sentry ? source.team : target.team, text: Math.round(amount).toString()
      });
      const stitch = target.stitch;
      if (target.hp > 0 && stitch?.source === source.id && stitch.until > this.time && stitch.ready <= this.time) {
        target.stunUntil = Math.max(target.stunUntil, this.time + .22);
        stitch.ready = this.time + .65;
        if (--stitch.hits === 0) target.stitch = null;
        this.effect('burst', target.x, target.y, { team:source.team, radius:42, hero:source.hero });
      }
      const deny = target.type === 'creep' && source.type === 'hero' && target.team === source.team;
      if (attack && source.type === 'hero' && target.type !== 'building') {
        const stats = source.stats;
        if (source.hp > 0 && stats.life) source.hp = Math.min(source.maxHp, source.hp + amount * stats.life);
        if (!deny) {
          if (stats.chill) this.slow(target, stats.chill, 1.5, 'frost');
          if (stats.splash) {
            const cleave = stats.splash * (HEROES[source.hero].range > 150 ? .5 : 1);
            for (const unit of this.units.values()) {
              if (unit !== target && unit.team !== source.team && unit.type !== 'building' && distance(unit, target) < 170) {
                this.hurt(unit, raw * cleave, source);
              }
            }
          }
          if (target.stats?.reflect) this.hurt(source, raw * target.stats.reflect, target);
        }
      }
      if (target.hp <= 0) this.kill(target, source, deny);
      return amount;
    }
    kill(unit, source, deny) {
      unit.hp = 0;
      const hero = this.heroes[1 - unit.team];
      if (unit.type === 'creep') {
        if (unit.sentry) return;
        if (source === hero && !deny) {
          hero.gold += unit.gold;
          hero.lastHits++;
          if (hero.heat != null && hero.hp > 0) hero.heat = Math.min(hero.heat + 1, HEROES[hero.hero].heat.max);
          this.effect('gold', unit.x, unit.y, { audience: hero.team, text: '+' + unit.gold });
        }
        if (deny) {
          source.denies++;
          this.effect('gold', unit.x, unit.y, { audience: source.team, text: 'Denied' });
        }
        if (hero.hp > 0 && distance(hero, unit) <= 1200) this.gainXp(hero, unit.xp * (deny ? .4 : 1));
      } else if (unit.type === 'hero') {
        unit.deaths++;
        unit.stitch = null;
        unit.disarmedUntil = 0;
        if (unit.heat != null) unit.heat = Math.floor(unit.heat / 2);
        this.effect('fall', unit.x, unit.y, { unit: 'hero' });
        unit.respawn = this.time + 5 + 2.2 * unit.level;
        unit.order = null;
        unit.windup = null;
        unit.dash = null;
        unit.channel = 0;
        unit.potionUntil = 0;
        unit.buffs = [];
        unit.slows = [];
        unit.stunUntil = 0;
        const gold = 180 + 12 * unit.level;
        hero.gold += gold;
        this.gainXp(hero, 100 + 35 * unit.level);
        this.kills[hero.team]++;
        this.effect('feed', unit.x, unit.y, { team: hero.team, text: hero.name + ' killed ' + unit.name + ' (+' + gold + ' gold)' });
      } else {
        if (unit.kind === 'core') {
          this.finish(1 - unit.team, 'core');
        } else {
          hero.gold += 180;
          this.effect('fall', unit.x, unit.y, { unit: 'tower' });
          this.effect('feed', unit.x, unit.y, { team: unit.team, text: TEAM[unit.team] + ' ' + unit.kind + ' tower destroyed' });
        }
      }
    }
    finish(winner, reason) {
      if (this.mode !== 'match') return;
      this.mode = 'ended';
      this.winner = winner;
      this.endReason = reason;
    }
    damageAtLaunch(a) {
      const s = a.stats;
      const damage = s ? s.damage * s.multiplier : a.damage * (a.hornUntil > this.time ? 1.4 : 1);
      return s?.crit && this.random() < s.crit ? damage * 1.8 : damage;
    }
    attackHit(a, b, damage = this.damageAtLaunch(a)) {
      if (a.team === b.team && (b.type !== 'creep' || b.hp >= b.maxHp / 2)) return;
      this.hurt(b, damage, a, { attack: true });
    }
    attackSpeed(unit) {
      return unit.stats?.haste ?? (unit.hornUntil > this.time ? 1.3 : 1);
    }
    attack(a, target) {
      const spec = a.type === 'hero' ? HEROES[a.hero] : a;
      if (!target || target.hp <= 0 || range(a, target) > spec.range || this.protected(target)) return false;
      if (a.attackReady > this.time || a.disarmedUntil > this.time) return true;
      const windup = a.type === 'hero' ? .28 : a.type === 'building' ? .2 : .35;
      a.windup = { target: target.id, time: this.time + windup / this.attackSpeed(a) };
      a.facing = Math.atan2(target.y - a.y, target.x - a.x);
      if (a.type === 'hero' && target.type === 'hero') a.recentAggro = this.time;
      return true;
    }
    focusCreep(creep, target) {
      creep.target = target.id;
      creep.forcedUntil = this.time + CREEP_AGGRO_TIME;
      if (creep.windup?.target !== target.id) creep.windup = null;
    }
    drawCreepAggro(hero) {
      for (const creep of this.nearbyCreeps(hero, 1 - hero.team, CREEP_AGGRO_RANGE)) {
        if (creep.aggroReady > this.time) continue;
        this.focusCreep(creep, hero);
        creep.aggroReady = this.time + CREEP_AGGRO_COOLDOWN;
      }
    }
    transferCreepAggro(hero, ally) {
      let transferred = false;
      for (const creep of this.nearbyCreeps(ally, 1 - hero.team, CREEP_AGGRO_RANGE)) {
        if (creep.target !== hero.id && creep.windup?.target !== hero.id) continue;
        this.focusCreep(creep, ally);
        transferred = true;
      }
      if (transferred && !hero.bot) this.notice(hero.team, 'Creep aggro transferred');
      return transferred;
    }
    finishAttack(a, spec) {
      if (!a.windup) return false;
      const shot = a.windup, b = this.units.get(shot.target);
      if (!b || b.hp <= 0 || range(a, b) > spec.range + 140 || this.protected(b)) {
        a.windup = null;
        return false;
      }
      if (this.time >= shot.time) {
        a.windup = null;
        a.attackReady = this.time + spec.interval / this.attackSpeed(a);
        if (spec.range <= 150) this.attackHit(a, b);
        else this.projectiles.push({ id: this.nextId++, kind: 'attack', x: a.x, y: a.y, from: a, target: b,
          team: a.team, damage: this.damageAtLaunch(a), speed: a.type === 'hero' ? 1100 : a.type === 'building' ? 1000 : 900 });
      }
      return !!a.windup;
    }
    slow(target, value, seconds, id = 'slow') {
      target.slows = target.slows.filter(slow => slow.id !== id);
      target.slows.push({ id, value, until: this.time + seconds });
    }
    magic(target, source, spell, damage) {
      if (target.team === source.team || target.hp <= 0 || target.type === 'building') return;
      if (spell.slow) this.slow(target, spell.slow, spell.slowTime);
      if (spell.stun) {
        target.stunUntil = Math.max(target.stunUntil, this.time + spell.stun);
      }
      if (target.type === 'hero') {
        if (spell.drain) target.mana = Math.max(0, target.mana - spell.drain);
        if (spell.disarm) {
          target.disarmedUntil = Math.max(target.disarmedUntil || 0, this.time + spell.disarm);
          target.windup = null;
        }
      }
      this.hurt(target, damage, source, { ability: true });
      if (target.hp <= 0) return;
      if (spell.stitch && target.type === 'hero') {
        target.stitch = { source:source.id, until:this.time + 4, ready:this.time + .25, hits:3 };
      }
      if (spell.push && !target.dummy && !target.sentry) {
        Object.assign(target, point(source, target.x, target.y, Infinity, distance(source,target) + spell.push));
        if (target.type === 'hero') target.jump = (target.jump || 0) + 1;
      }
    }
    blast(h, spell, x, y, damage) {
      this.effect('burst', x, y, { team: h.team, radius: spell.radius, hero: h.hero });
      for (const unit of this.units.values()) {
        if (Math.hypot(unit.x - x, unit.y - y) <= spell.radius + unit.r / 2) this.magic(unit, h, spell, damage);
      }
    }
    cast(h, i, x, y) {
      if (h.stunUntil > this.time || h.dash) return 'Unable to act';
      const spec = HEROES[h.hero], spell = abilitySpell(h, i);
      const free = Boolean(this.training);
      const error = abilityError(h, i, this.time, spell, free);
      if (error) return error;
      if (spell.kind === 'mark') {
        h.marks = [...h.marks.slice(1 - WEAVE_MARKS), i];
        return null;
      }
      if (!free) {
        const readyAt = this.time + spell.cd * (1 - (h.stats.cdr || 0));
        h.mana -= spell.mana;
        if (i >= 4) h.weaveReady[h.prepared[i - 4]] = readyAt;
        else h.cd[i] = readyAt;
      }
      if (spell.kind === 'invoke') {
        const recipe = weaveRecipe(h);
        h.prepared = [recipe, ...h.prepared.filter(previous => previous !== recipe)].slice(0, 2);
        h.marks = [];
        return null;
      }
      const ultimate = i === 3 && !spec.weaves;
      h.windup = null;
      h.channel = 0;
      if (spell.kind !== 'nova' && spell.kind !== 'buff' && (x !== h.x || y !== h.y)) h.facing = Math.atan2(y - h.y, x - h.x);
      const damage = spellDamage(h, spell);
      if (spell.heatDamage) h.heat = 0;
      this.effect('cast', h.x, h.y, { team: h.team, hero: h.hero, spell: spell.kind, ultimate });
      switch (spell.kind) {
        case 'bolt': {
          const dx = Math.cos(h.facing), dy = Math.sin(h.facing);
          this.projectiles.push({ id: this.nextId++, kind: 'bolt', x: h.x + dx * 20, y: h.y + dy * 20,
            from: h, team: h.team, speed: spell.speed, dx, dy, left: spell.range, spell, damage, hit: new Set() });
          break;
        }
        case 'blast': {
          this.areas.push({ id: this.nextId++, ...castPoint(h, spell, x, y), from: h, team: h.team, radius: spell.radius,
            time: this.time + spell.delay, duration: spell.delay, ultimate, hits: spell.hits || 1, spell, damage,
            ...(spell.travel && { heading:h.facing }) });
          break;
        }
        case 'sentry': {
          const maxHp = spell.health + (h.level - 1) * 15;
          this.creeps.push(this.unit({ type:'creep', kind:'ranged', team:h.team, ...castPoint(h, spell, x, y),
            r:17, hp:maxHp, maxHp, armor:2, range:420, interval:1.05, damage:spell.shot + (h.level - 1) * spell.shotGrowth,
            sentry:true, expires:this.time + spell.duration }));
          break;
        }
        case 'nova':
          this.blast(h, spell, h.x, h.y, damage);
          break;
        case 'dash':
          h.dash = { ...castPoint(h, spell, x, y), spell, damage };
          break;
        case 'blink':
          this.blink(h, castPoint(h, spell, x, y));
          break;
        case 'buff':
          this.buff(h, spell.name, spell.duration, spell.stats);
          break;
      }
      return null;
    }
    buff(h, id, duration, stats) {
      h.buffs = h.buffs.filter(buff => buff.id !== id);
      h.buffs.push({ id, until: this.time + duration, stats });
    }
    blink(h, destination) {
      this.effect('burst', h.x, h.y, { team: h.team, radius: 65, hero: h.hero });
      Object.assign(h, destination);
      h.jump = (h.jump || 0) + 1;
      if (h.order?.o === 'move') h.order = null;
      this.effect('burst', h.x, h.y, { team: h.team, radius: 75, hero: h.hero });
    }
    canShop(h) {
      return !!this.training || h.hp <= 0 || distance(h, home(h.team)) <= 430;
    }
    buy(h, id) {
      const plan = shopOffer(h, id, this.time, this.canShop(h));
      if (plan.reason) return plan.reason;
      h.gold -= plan.cost;
      if (id === 'potion') h.pots++;
      else if (id === 'tome') {
        h.tomeReady = this.time + 150;
        this.gainXp(h, 220);
      } else {
        const spent = plan.cost + plan.consumed.reduce((sum, i) => sum + sellValue(h.inventory[i], this.time), 0);
        h.inventory = h.inventory.filter((_, i) => !plan.consumed.includes(i));
        h.inventory.push({ id, spent, at: this.time });
        this.recalculateItemStats(h);
      }
      return null;
    }
    recalculateItemStats(h) {
      const hp = h.maxHp, mana = h.maxMana;
      refresh(h, this.time);
      h.hp = Math.min(h.maxHp, h.hp + (h.hp > 0 ? Math.max(0, h.maxHp - hp) : 0));
      h.mana = Math.min(h.maxMana, h.mana + Math.max(0, h.maxMana - mana));
    }
    sell(h, slot) {
      if (!this.canShop(h)) return 'Shop at your fountain or while dead';
      const item = h.inventory[slot];
      if (!item) return 'Empty slot';
      h.inventory.splice(slot, 1);
      h.gold += sellValue(item, this.time);
      this.recalculateItemStats(h);
      return null;
    }
    useItem(h, i, x, y) {
      const slot = h.inventory[i], id = slot?.id;
      if (!slot || !ITEMS[id].cd) return 'No active item in this slot';
      if (h.stunUntil > this.time || h.dash) return 'Unable to act';
      if (h.itemsReady[id] > this.time) return 'Item cooling down';
      if (id === 'rift' && this.time - h.lastThreat < 2.5) return 'Rift Stone is disabled in combat';
      if (id === 'rift') {
        this.blink(h, point(h, x, y, 520));
        h.channel = 0;
        h.windup = null;
      }
      if (id === 'striders') {
        this.buff(h, 'sprint', 4, { move: .35 });
        h.channel = 0;
      }
      if (id === 'locket') {
        h.hp = Math.min(h.maxHp, h.hp + 280);
        h.mana = Math.min(h.maxMana, h.mana + 120);
      }
      if (id === 'horn') {
        const nearby = this.creeps.filter(creep => creep.hp > 0 && creep.team === h.team && distance(h, creep) < 700);
        if (!nearby.length) return 'War Horn requires nearby allied creeps';
        for (const creep of nearby) creep.hornUntil = this.time + 8;
        this.effect('burst', h.x, h.y, { team: h.team, radius: 700, hero: h.hero });
      }
      h.itemsReady[id] = this.time + ITEMS[id].cd;
      return null;
    }
    order(team, cmd) {
      if (!validOrder(cmd) || this.mode !== 'match' || (this.training && team !== 0)) return 'Invalid order';
      const h = this.heroes[team];
      const { o, i, id, x, y } = cmd;
      if (o === 'buy') {
        const cost = h.gold;
        const error = this.buy(h, id);
        if (!error) this.effect('purchase', h.x, h.y, { audience: team, item: id, cost: Math.round(cost - h.gold) });
        return error;
      }
      if (o === 'sell') return this.sell(h, i);
      if (h.hp <= 0) return 'You are respawning';
      switch (o) {
        case 'move':
        case 'amove':
          h.order = { o, ...point(h, x, y) };
          h.channel = 0;
          if (o === 'move') h.windup = null;
          break;
        case 'attack': {
          const target = this.units.get(id);
          if (!target || target.hp <= 0 || this.protected(target) ||
            (target.team === team && target.type !== 'creep')) return 'Invalid attack target';
          if (target.team === team) {
            const transferred = this.transferCreepAggro(h, target);
            h.order = target.hp < target.maxHp / 2 ? { o, id } :
              transferred ? { o:'stop' } : { o:'move', ...point(h, target.x, target.y) };
          } else {
            if (target.type === 'hero') this.drawCreepAggro(h);
            h.order = { o, id };
          }
          h.channel = 0;
          if (h.order.o !== 'attack' || h.windup?.target !== id) h.windup = null;
          break;
        }
        case 'stop':
          h.order = { o };
          h.channel = 0;
          h.windup = null;
          break;
        case 'cast':
          if ((cmd.castMode && (cmd.castMode === 'point') !== abilityNeedsTarget(abilitySpell(h, i))) ||
            (cmd.recipe && cmd.recipe !== h.prepared?.[i - 4])) return 'Spell changed. Select the ability again.';
          return this.cast(h, i, x, y);
        case 'item':
          return this.useItem(h, i, x, y);
        case 'potion':
          if (!h.pots) return 'No potions';
          if (h.potionUntil > this.time) return 'Potion already active';
          h.pots--;
          h.potionUntil = this.time + 10;
          break;
        case 'recall':
          if (h.channel) return 'Recall already active';
          if (h.stunUntil > this.time || h.dash) return 'Unable to act';
          if (h.recallReady > this.time) return 'Recall cooling down';
          h.channel = this.time + 3;
          h.order = null;
          h.windup = null;
          break;
      }
      return null;
    }
    nearest(unit, radius, filter = () => true) {
      let best = null, closest = radius;
      for (const other of this.units.values()) {
        if (other.hp <= 0 || other.team === unit.team || this.protected(other) || !filter(other)) continue;
        const d = range(unit, other);
        if (d <= closest) {
          closest = d;
          best = other;
        }
      }
      return best;
    }
    walk(u, target, speed, dt) {
      let p = point(u, target.x, target.y, speed * dt);
      for (const b of this.buildings) {
        const clearance = b.r + u.r;
        if (u.dash || b.hp <= 0 || Math.abs(p.x - b.x) >= clearance || Math.abs(p.y - b.y) >= clearance ||
          distance(p, b) >= clearance || distance(p, b) >= distance(u, b)) continue;
        const d = distance(u, b) || 1;
        const nx = (u.x - b.x) / d, ny = (u.y - b.y) / d;
        const tangent = (target.x - u.x) * -ny + (target.y - u.y) * nx;
        const dir = Math.sign(tangent) || (u.team ? 1 : -1);
        p = point(u, u.x + (.18 * nx - dir * ny) * speed * dt, u.y + (.18 * ny + dir * nx) * speed * dt);
      }
      u.vx = (p.x - u.x) / dt;
      u.vy = (p.y - u.y) / dt;
      if (Math.abs(u.vx) + Math.abs(u.vy) > .01) u.facing = Math.atan2(u.vy, u.vx);
      Object.assign(u, p);
    }
    movementSpeed(unit, speed) {
      return speed * (1 - unit.slows.reduce((max, s) => Math.max(max, s.value), 0));
    }
    updateHero(h, dt) {
      h.gold += dt * 1.6;
      if (h.hp <= 0) {
        h.cd = h.cd.map(ready => ready > this.time - dt ? ready + dt : ready);
        if (h.recallReady > this.time - dt) h.recallReady += dt;
        if (h.bot && this.time >= h.think) this.think(h);
        if (this.time >= h.respawn) {
          Object.assign(h, home(h.team));
          h.jump = (h.jump || 0) + 1;
          refresh(h, this.time);
          h.hp = h.maxHp;
          h.mana = h.maxMana;
        }
        return;
      }
      h.buffs = h.buffs.filter(b => b.until > this.time);
      refresh(h, this.time);
      const regen = h.stats.regen + (h.potionUntil > this.time ? 30 : 0) +
        (h.stats.recover && this.time - h.lastThreat >= 6 ? h.stats.recover * h.maxHp : 0);
      const fountain = distance(h, home(h.team)) <= 400 ? .15 : 0;
      h.hp = Math.min(h.maxHp, h.hp + dt * (regen + h.maxHp * fountain));
      h.mana = Math.min(h.maxMana, h.mana + dt * (h.stats.manaRegen + h.maxMana * fountain));
      if (!this.training && distance(h, home(1 - h.team)) <= 420) {
        h.hp = Math.max(0, h.hp - 300 * dt);
        if (!h.hp) this.kill(h, this.getBuilding(1 - h.team, 'core'), false);
      }
      if (h.hp <= 0) return;
      if (h.dash) {
        this.walk(h, h.dash, h.dash.spell.speed, dt);
        if (distance(h, h.dash) < 1e-6) {
          this.blast(h, h.dash.spell, h.x, h.y, h.dash.damage);
          h.dash = null;
        }
        return;
      }
      if (h.stunUntil > this.time) {
        h.windup = null;
        h.channel = 0;
        return;
      }
      if (h.bot && this.time >= h.think) this.think(h);
      if (h.dash) return;
      if (h.channel) {
        if (h.channel <= this.time) {
          h.channel = 0;
          h.recallReady = this.time + 45;
          this.blink(h, this.training ? TRAINING_START : home(h.team));
        }
        return;
      }
      const spec = HEROES[h.hero];
      if (this.finishAttack(h, spec)) return;
      const order = h.order;
      if (order?.o === 'stop') return;
      const speed = this.movementSpeed(h, h.stats.speed);
      if (order?.o === 'move') {
        this.walk(h, order, speed, dt);
        if (distance(h, order) < 2) h.order = null;
        return;
      }
      const target = order?.o === 'attack' ? this.units.get(order.id) :
        (!h.bot || order?.o === 'amove' ? this.nearest(h, spec.range + (order ? 200 : 140)) : null);
      if (target?.hp > 0 && !this.protected(target) && (target.team !== h.team || target.hp < target.maxHp * .5)) {
        if (!this.attack(h, target)) this.walk(h, target, speed, dt);
      } else if (order?.o === 'amove') {
        this.walk(h, order, speed, dt);
        if (distance(h, order) < 2) h.order = null;
      } else if (order?.o === 'attack') h.order = null;
    }
    updateCreep(c, dt) {
      if (c.sentry && this.time >= c.expires) {
        c.hp = 0;
        return;
      }
      if (c.stunUntil > this.time) {
        c.windup = null;
        return;
      }
      if (this.finishAttack(c, c)) return;
      if (c.sentry) {
        this.attack(c, this.nearest(c, c.range, target => target.type !== 'building'));
        return;
      }
      let target = this.units.get(c.target);
      if (target && (target.hp <= 0 || this.protected(target) || distance(c, target) > 720)) target = null;
      if (!target || (!(c.forcedUntil > this.time) && this.time >= c.scan)) {
        c.forcedUntil = 0;
        target = this.nearest(c, 480);
        c.scan = this.time + .4;
      }
      c.target = target?.id;
      if (!this.attack(c, target)) {
        const march = { x: c.team ? 520 : 4680, y: c.y + clamp(c.laneY - c.y, -40, 40) };
        this.walk(c, target || march, this.movementSpeed(c, c.speed), dt);
      }
    }
    updateBuilding(b, dt) {
      if (b.kind === 'core') {
        b.hp = Math.min(b.maxHp, b.hp + 3 * dt);
        return;
      }
      const enemy = this.heroes[1 - b.team];
      const danger = enemy.hp > 0 && range(b, enemy) <= b.range && this.time - enemy.recentAggro <= 2.5;
      this.finishAttack(b, b);
      let target = this.units.get(b.target);
      if (danger) target = enemy;
      else if (!target || target.hp <= 0 || range(b, target) > b.range) {
        target = this.nearest(b, b.range, t => t.type === 'creep') ||
          this.nearest(b, b.range, t => t.type === 'hero');
      }
      b.target = target?.id;
      if (!b.windup) this.attack(b, target);
    }
    collide() {
      const units = [...this.units.values()].filter(u => u.hp > 0);
      for (let i = 0; i < units.length; i++) {
        const a = units[i];
        for (let j = i + 1; j < units.length; j++) {
          const b = units[j], required = a.r + b.r;
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) >= required || Math.abs(dy) >= required) continue;
          const d = Math.hypot(dx, dy);
          if (d >= required) continue;
          const am = a.type === 'building' || a.dash || a.dummy || a.sentry ? 0 : 1;
          const bm = b.type === 'building' || b.dash || b.dummy || b.sentry ? 0 : 1;
          if (!am && !bm) continue;
          const push = (required - d) * (am && bm ? .35 : 1);
          const px = d > .01 ? dx / d * push : push, py = d > .01 ? dy / d * push : 0;
          if (am) Object.assign(a, point(a, a.x - px, a.y - py));
          if (bm) Object.assign(b, point(b, b.x + px, b.y + py));
        }
      }
    }
    updateProjectiles(dt) {
      this.projectiles = this.projectiles.filter(p => {
        if (p.kind === 'attack') {
          if (p.target.hp <= 0) return false;
          const d = distance(p, p.target);
          if (d <= p.speed * dt + p.target.r / 2) {
            this.attackHit(p.from, p.target, p.damage);
            return false;
          }
          p.x += (p.target.x - p.x) / d * p.speed * dt;
          p.y += (p.target.y - p.y) / d * p.speed * dt;
          return true;
        }
        const length = Math.min(p.left, p.speed * dt);
        const targets = [];
        for (const u of this.units.values()) {
          if (u.hp <= 0 || u.team === p.team || u.type === 'building' || p.hit.has(u.id)) continue;
          const t = clamp((u.x - p.x) * p.dx + (u.y - p.y) * p.dy, 0, length);
          if (Math.hypot(u.x - p.x - p.dx * t, u.y - p.y - p.dy * t) <= p.spell.radius + u.r) targets.push({ u, t });
        }
        targets.sort((a, b) => a.t - b.t);
        for (const { u } of targets) {
          p.hit.add(u.id);
          this.magic(u, p.from, p.spell, p.damage);
          if (!p.spell.piercing) return false;
        }
        p.left -= length;
        p.x += p.dx * length;
        p.y += p.dy * length;
        return p.left > 0 && p.x >= 0 && p.x <= WIDTH && p.y >= 0 && p.y <= HEIGHT;
      });
    }
    updateOrb() {
      if (!this.orb && this.time >= this.nextOrb) {
        const kinds = Object.keys(ORBS);
        this.orb = { x: 2600, y: this.random() < .5 ? 170 : 730, kind: kinds[Math.floor(this.random() * kinds.length)] };
        this.effect('feed', this.orb.x, this.orb.y, { text: this.orb.kind + ' orb appeared at the river' });
      }
      if (!this.orb) return;
      const h = this.heroes.find(h => h.hp > 0 && distance(h, this.orb) <= 50);
      if (!h) return;
      const { kind, x, y } = this.orb;
      if (kind === 'Haste') this.buff(h, kind, 12, { move: .40 });
      if (kind === 'Might') this.buff(h, kind, 15, { multiplier: .6 });
      if (kind === 'Renewal') this.buff(h, kind, 8, { regen: h.maxHp * .06, manaRegen: h.maxMana * .06 });
      if (kind === 'Wealth') h.gold += 120;
      this.effect('feed', x, y, { team: h.team, text: h.name + ' claimed ' + kind });
      this.orb = null;
      this.nextOrb = this.time + 75;
    }
    step(dt) {
      if (this.mode !== 'match') return;
      this.time += dt;
      this.effects = this.effects.filter(e => this.time - e.time < 4);
      if (!this.training && this.time + 1e-8 >= this.nextWave) {
        this.spawn();
        this.nextWave += 30;
      }
      for (const u of this.units.values()) {
        u.vx = u.vy = 0;
        u.slows = u.slows.filter(s => s.until > this.time);
      }
      for (const h of this.heroes) if (!h.dummy) this.updateHero(h, dt);
      for (const b of this.buildings) if (b.hp > 0) this.updateBuilding(b, dt);
      for (const c of this.creeps) if (c.hp > 0) this.updateCreep(c, dt);
      this.collide();
      this.updateProjectiles(dt);
      this.areas = this.areas.filter(a => {
        if (this.time + 1e-8 < a.time) return true;
        this.blast(a.from, a.spell, a.x, a.y, a.damage);
        if (--a.hits <= 0) return false;
        if (a.spell.travel) {
          const x = a.x + Math.cos(a.heading) * a.spell.travel, y = a.y + Math.sin(a.heading) * a.spell.travel;
          if (x < 20 || x > WIDTH - 20 || y < 20 || y > HEIGHT - 20) return false;
          Object.assign(a, { x, y });
        }
        a.time += a.spell.interval || 0;
        a.duration = a.spell.interval;
        return true;
      });
      if (!this.training) this.updateOrb();
      this.creeps = this.creeps.filter(c => {
        if (c.hp > 0) return true;
        this.units.delete(c.id);
        return false;
      });
    }
    frontTower(team) {
      return this.buildings.find(b => b.team === team && b.kind !== 'core' && b.hp > 0);
    }
    nearbyCreeps(center, team, radius) {
      return this.creeps.filter(c => c.hp > 0 && c.team === team && distance(c, center) < radius);
    }
    towerTanked(tower, hero) {
      return tower.target !== hero.id && this.nearbyCreeps(tower, hero.team, tower.range).length >= 2;
    }
    clearShot(hero, enemy, width) {
      const length = distance(hero, enemy) || 1;
      const dx = (enemy.x - hero.x) / length, dy = (enemy.y - hero.y) / length;
      return !this.creeps.some(c => {
        if (c.hp <= 0 || c.team === hero.team) return false;
        const x = c.x - hero.x, y = c.y - hero.y;
        const along = x * dx + y * dy;
        return along >= 0 && along <= length && Math.abs(x * dy - y * dx) < width + c.r;
      });
    }
    creepCluster(hero, reach, radius, minimum = 0) {
      let best = null, count = 2;
      for (const c of this.nearbyCreeps(hero, 1 - hero.team, reach)) {
        if (minimum && distance(hero, c) < minimum) continue;
        const cluster = this.nearbyCreeps(c, c.team, radius).length;
        if (cluster > count) {
          best = c;
          count = cluster;
        }
      }
      return best;
    }
    abilityReady(hero, i, mana = hero.mana) {
      const spell = abilitySpell(hero, i);
      return hero.level >= abilityLevel(hero, i) && abilityReadyAt(hero, i) <= this.time && mana >= spell.mana;
    }
    weaveAvailable(hero, recipe, spell) {
      return hero.mana >= spell.mana && (hero.weaveReady[recipe] || 0) <= this.time &&
        (hero.cd[3] <= this.time || hero.prepared.includes(recipe));
    }
    aiBurst(hero, enemy) {
      let mana = hero.mana;
      let damage = 3 * hero.stats.damage * hero.stats.multiplier * physical(enemy.armor);
      const spec = HEROES[hero.hero];
      if (spec.weaves) {
        const weaves = Object.entries(spec.weaves).filter(([recipe, spell]) => this.weaveAvailable(hero, recipe, spell)).map(([, spell]) => spell);
        return damage + Math.max(0, ...weaves.map(spell => .75 * spellDamage(hero, spell) * (spell.hits ? spell.hits * .5 : 1)));
      }
      for (const [i, spell] of spec.abilities.entries()) {
        if (!spell.damage || !this.abilityReady(hero, i, mana)) continue;
        mana -= spell.mana;
        damage += .75 * spellDamage(hero, spell) * (spell.hits ? spell.hits * .5 : 1);
      }
      return damage;
    }
    castBotSpell(h, i, pos, recipe) {
      if (recipe) {
        let slot = h.prepared.indexOf(recipe);
        if (slot < 0) {
          const previous = h.marks;
          h.marks = Array.from(recipe, mark => 'QWE'.indexOf(mark));
          if (this.order(h.team, { o:'cast', i:3, x:pos.x, y:pos.y })) {
            h.marks = previous;
            return false;
          }
          slot = 0;
        }
        i = slot + 4;
      }
      return !this.order(h.team, { o:'cast', i, x:pos.x, y:pos.y });
    }
    aiCast(h, enemy, mode, difficulty) {
      if (this.random() > difficulty.cast) return false;
      const spec = HEROES[h.hero], enemyAlive = enemy.hp > 0;
      const reach = enemyAlive ? distance(h, enemy) : Infinity;
      const health = h.hp / h.maxHp, mana = h.mana / h.maxMana;
      const enemyHealth = enemyAlive ? enemy.hp / enemy.maxHp : 1;
      const kill = mode === 'kill', push = mode === 'push';
      const aim = seconds => ({
        x: enemy.x + enemy.vx * seconds * difficulty.lead + (this.random() - .5) * difficulty.noise,
        y: enemy.y + enemy.vy * seconds * difficulty.lead + (this.random() - .5) * difficulty.noise
      });
      const recipes = kill ? ['QQW', 'WEE', 'EEE', 'QWE', 'QQQ', 'WWW', 'QWW', 'WWE', 'QEE', 'QQE'] :
        ['WWE', 'QQE', 'QQW', 'WWW', 'QQQ', 'QEE', 'QWE', 'WEE', 'EEE', 'QWW'];
      const options = spec.weaves ? recipes.map(recipe => ({ i:3, spell:spec.weaves[recipe], recipe })) :
        [3, 1, 0, 2].map(i => ({ i, spell:spec.abilities[i] }));
      for (const { i, spell, recipe } of options) {
        if (recipe ? !this.weaveAvailable(h, recipe, spell) : !this.abilityReady(h, i)) continue;
        const ultimate = i === 3 && !recipe;
        const cast = pos => this.castBotSpell(h, i, pos, recipe);
        switch (spell.kind) {
          case 'bolt': {
            if (reach < spell.range * .85 && (kill || mana > .35) &&
              (spell.piercing || this.clearShot(h, enemy, spell.radius))) return cast(aim(reach / spell.speed));
            const cluster = push && spell.piercing && mana > .7 && this.creepCluster(h, spell.range * .7, 150);
            if (cluster) return cast(cluster);
            break;
          }
          case 'blast': {
            const want = kill || (ultimate ? enemyHealth < .7 && mana > .3 : mana > .4);
            const inRange = spell.fixed ? Math.abs(reach - spell.range) < spell.radius * .8 :
              reach < spell.range + spell.radius * (spell.range ? .4 : .9);
            if (inRange && want) return cast(aim(spell.delay * .8));
            const padding = spell.fixed ? spell.radius * .65 : 0;
            const cluster = push && !ultimate && mana > .75 &&
              this.creepCluster(h, spell.range + padding, spell.radius, spell.fixed ? spell.range - padding : 0);
            if (cluster) return cast(cluster);
            break;
          }
          case 'sentry':
            if ((push || reach < spell.range + 190) && mana > .52) return cast({
              x:h.x + (h.team ? -1 : 1) * 280, y:h.y
            });
            break;
          case 'nova':
            if (reach < spell.radius * .8 && (kill || mana > .3)) return cast(h);
            if (push && mana > .7 && this.nearbyCreeps(h, enemy.team, spell.radius * .9).length >= 3) return cast(h);
            break;
          case 'dash':
            if (reach < spell.range + 40 && reach > 140 && (kill || (mode === 'trade' && health > enemyHealth && mana > .5))) {
              return cast(enemy);
            }
            break;
          case 'blink':
            if (kill && reach > spec.range + 80 && reach < spell.range + spec.range * .8) {
              const fraction = (reach - spec.range * .7) / reach;
              return cast({ x: h.x + (enemy.x - h.x) * fraction, y: h.y + (enemy.y - h.y) * fraction });
            }
            break;
          case 'buff': {
            const target = h.order?.o === 'attack' ? this.units.get(h.order.id) : null;
            const siege = target?.type === 'building';
            const fighting = (target === enemy && reach < spec.range + 220) || siege;
            const offensive = spell.stats.haste || spell.stats.life;
            const defensive = spell.stats.armor && health < .65 && reach < 650;
            if (defensive || (fighting && offensive && (!ultimate || kill || enemyHealth < .6 || siege))) return cast(h);
            break;
          }
        }
      }
      return false;
    }
    think(h) {
      const d = DIFF[h.bot] || DIFF.normal, data = HEROES[h.hero], t = this.time;
      h.think = t + d.react * (.7 + this.random() * .6);
      const enemy = this.heroes[1 - h.team], own = home(h.team), enemyHome = home(enemy.team);
      const enemyAlive = enemy.hp > 0, enemyDist = enemyAlive ? distance(h, enemy) : Infinity;
      const hp = h.hp / h.maxHp, mana = h.mana / h.maxMana, enemyHp = enemy.hp / enemy.maxHp;
      const homeDist = distance(h, own), dir = h.team ? -1 : 1;
      const order = cmd => this.order(h.team, cmd);
      const go = ({x,y}) => order({ o: 'move', x, y });
      const hit = target => order({ o: 'attack', id: target.id });
      const use = id => {
        const i = h.inventory.findIndex(slot => slot.id === id);
        if (i >= 0) order({ o: 'item', i, x: h.x, y: h.y });
      };
      if ((!h.hp || homeDist < 400) && !h.windup) {
        if (h.level < 9 && !h.pots && h.gold >= 90) this.buy(h, 'potion');
        const id = data.build[h.buildIndex];
        if (id && !this.buy(h, id)) h.buildIndex++;
      }
      if (!h.hp || h.windup || h.dash || h.stunUntil > t) return;
      if (hp < .60 && enemyDist > 650) order({ o: 'potion' });
      if (hp < .50) use('locket');

      if (hp < .28 || (hp < .45 && enemyDist < 700 && enemyHp > hp + .25)) h.retreat = true;
      if (h.retreat) {
        if (homeDist < 300) {
          if (hp <= .92 || mana <= .70) return;
          h.retreat = false;
        } else {
          if (h.channel || (homeDist > 1600 && enemyDist > 800 && !order({ o: 'recall' }))) return;
          if (enemyDist < 800) use('striders');
          if (enemyDist < 700) {
            const away = { x:h.x - dir * 1000, y:h.y };
            if (data.weaves) {
              if (this.weaveAvailable(h, 'QWW', data.weaves.QWW)) this.castBotSpell(h, 3, away, 'QWW');
            } else {
              const escape = data.abilities.findIndex((spell, i) => this.abilityReady(h, i) &&
                (spell.kind === 'dash' || spell.kind === 'blink' || (spell.kind === 'buff' && (spell.stats.move || spell.stats.armor))));
              if (escape >= 0) this.castBotSpell(h, escape, away);
            }
          }
          go(own);
          return;
        }
      }

      const enemyTowers = this.buildings.filter(b => b.team === enemy.team && b.kind !== 'core' && b.hp > 0);
      const nearTower = enemyTowers.findLast(b => distance(h, b) < b.range + 90);
      if (nearTower && !this.towerTanked(nearTower, h)) {
        go({ x: nearTower.x - dir * (nearTower.range + 230), y: clamp(h.y, 330, 570) });
        return;
      }
      if (Math.abs(h.x - enemyHome.x) < 480) {
        go({ x: h.x - dir * 300, y: h.y });
        return;
      }

      const allies = this.nearbyCreeps(h, h.team, 500);
      const enemies = this.nearbyCreeps(h, enemy.team, 500);
      if (enemyDist < 1100) {
        const shelter = enemyTowers.find(b => distance(enemy, b) < b.range + 60);
        const enemySafe = (shelter && !this.towerTanked(shelter, h)) || Math.abs(enemy.x - enemyHome.x) < 620;
        if (!enemySafe && hp > .30 && enemy.hp < this.aiBurst(h, enemy) * d.killJudge) {
          if (enemyDist > data.range + 60) use('striders');
          hit(enemy);
          this.aiCast(h, enemy, 'kill', d);
          return;
        }
      }

      let lastHit = null, score = 0, weakest = null;
      for (const c of this.creeps) {
        if (c.hp <= 0 || distance(c, h) > data.range + 320) continue;
        const hitDamage = h.stats.damage * h.stats.multiplier * physical(c.armor);
        if (c.sentry) {
          if (c.team !== h.team && c.hp <= hitDamage && !score) {
            lastHit = c;
            score = 1;
          }
          continue;
        }
        if (c.team !== h.team) {
          if (c.roll[h.team] >= d.lastHit && c.hp < c.maxHp * .30) continue;
          if (c.hp <= hitDamage * 1.08 && c.gold > score) {
            lastHit = c;
            score = c.gold;
          }
          if (!weakest || c.hp < weakest.hp) weakest = c;
        } else if (d.deny && c.hp < hitDamage && c.hp < c.maxHp / 2 && score < 5) {
          lastHit = c;
          score = 5;
        }
      }
      if (lastHit) {
        hit(lastHit);
        return;
      }

      const ownTower = this.frontTower(h.team), enemyTower = enemyTowers[0];
      const objective = enemyTower || this.getBuilding(enemy.team, 'core');
      if (enemies.length <= 1 && range(h, objective) <= data.range + 300 && (!enemyTower || this.towerTanked(enemyTower, h))) {
        use('horn');
        hit(objective);
        this.aiCast(h, enemy, 'siege', d);
        return;
      }

      const defend = !ownTower || this.nearbyCreeps(ownTower, enemy.team, ownTower.range).length > 0;
      const push = !enemyAlive || enemyDist > 1500 || h.level >= enemy.level + 2 || t > 420 || defend;
      const trade = enemyAlive && enemyDist - enemy.r <= data.range + (data.range > 150 ? 60 : 260) &&
        hp >= enemyHp - .15 && enemies.length <= allies.length + 1 && this.random() < d.harass;
      if (trade) {
        hit(enemy);
        this.aiCast(h, enemy, 'trade', d);
        return;
      }
      if (this.aiCast(h, enemy, push ? 'push' : 'lane', d)) return;
      if (push && weakest) {
        hit(weakest);
        return;
      }

      if (this.orb && Math.abs(h.x - this.orb.x) < 700 && hp > .5 &&
        (!enemyAlive || distance(enemy, this.orb) > distance(h, this.orb)) && this.random() < .5) {
        go(this.orb);
        return;
      }
      const front = this.creeps.reduce((x, c) => c.hp > 0 && c.team === h.team ? Math.max(x, c.x * dir) : x, -Infinity);
      const base = ownTower ? ownTower.x * dir + 40 : this.getBuilding(h.team, 'core').x * dir + 220;
      const follow = front === -Infinity ? base : Math.max(front - (data.range > 150 ? 230 : 30), base - 150);
      const limit = enemyTower && !this.towerTanked(enemyTower, h) ? enemyTower.x * dir - enemyTower.range - 140 :
        enemyTower ? Infinity : enemyHome.x * dir - 640;
      if (this.random() < .2) h.sway = (this.random() - .5) * 220;
      const hold = { x: Math.min(follow, limit) * dir, y: 450 + h.sway };
      if (distance(h, hold) > 50) go(hold);
    }
    snapshot(team, full = false) {
      const angle = n => Math.round(n * 100) / 100;
      const base = ({ id, type, kind, team, x, y, r, hp, maxHp, windup, stunUntil }) =>
        ({ id, type, kind, team, x, y, r, hp, maxHp, attack: !!windup, stunned: stunUntil > this.time });
      const heroes = this.heroes.map(h => {
        const common = { ...base(h), hero: h.hero, name: h.name, level: h.level, respawn: h.respawn,
          channel: h.channel, mana: h.mana, maxMana: h.maxMana, deaths: h.deaths, lastHits: h.lastHits, denies: h.denies, jump: h.jump || 0,
          facing: h.facing, buffs: h.buffs.map(b => b.id), potionActive: h.potionUntil > this.time, computer: !!h.bot,
          ...(h.heat != null && { heat:h.heat }),
          ...(h.dummy && { dummy:true }),
          ...(h.stitch?.until > this.time && { stitched:true }),
          ...(h.disarmedUntil > this.time && { disarmed:true }),
          loadout: h.inventory.map(item => item.id) };
        if (h.team !== team && !full) return common;
        return { ...common, gold: h.gold, xp: h.xp, cd: h.cd, inventory: h.inventory, itemsReady: h.itemsReady,
          ...(h.marks && { marks:h.marks, prepared:h.prepared, weaveReady:h.weaveReady }),
          recallReady: h.recallReady, tomeReady: h.tomeReady, pots: h.pots, stats: h.stats, potionUntil: h.potionUntil,
          canShop: this.canShop(h) };
      });
      const quant = n => Math.round(n * 10) / 10;
      return { time: this.time, mode: this.mode, winner: this.winner, endReason: this.endReason, orb: this.orb, wave: this.wave, kills: this.kills,
        ...(this.training && { training:{ ...this.training } }),
        heroes, buildings: this.buildings.map(u => ({ ...base(u), protected: this.protected(u),
          ...(u.kind === 'core' ? {} : { range: u.range, target: u.windup?.target || u.target }) })),
        creeps: this.creeps.map(c => [c.id, c.team, c.kind, quant(c.x), quant(c.y), Math.ceil(c.hp), Math.ceil(c.maxHp), !!c.windup, quant(c.r), angle(c.facing),
          (c.stunUntil > this.time ? CREEP_FLAGS.stunned : 0) | (c.hornUntil > this.time ? CREEP_FLAGS.rallied : 0) |
          (c.hp < c.maxHp / 2 && !c.sentry ? CREEP_FLAGS.deniable : 0) | (c.sentry ? CREEP_FLAGS.sentry : 0)]),
        projectiles: this.projectiles.map(p => p.kind === 'bolt' ?
          [p.id, p.team, p.kind, quant(p.x), quant(p.y), p.from.hero, angle(p.dx), angle(p.dy), p.spell.radius] :
          [p.id, p.team, p.kind, quant(p.x), quant(p.y), p.from.hero || p.from.type]),
        areas: this.areas.map(a => [a.id, a.team, a.radius, a.x, a.y, a.time, a.duration, a.from.hero, a.ultimate]),
        effects: this.effects.filter(e => e.audience == null || team === e.audience || full) };
    }
  }
  function validOrder(cmd) {
    if (!cmd || typeof cmd !== 'object') return false;
    const pos = Number.isFinite(cmd.x) && Number.isFinite(cmd.y) && Math.abs(cmd.x) <= 10000 && Math.abs(cmd.y) <= 10000;
    const slot = (limit) => Number.isInteger(cmd.i) && cmd.i >= 0 && cmd.i < limit;
    switch (cmd.o) {
      case 'move':
      case 'amove': return pos;
      case 'attack': return Number.isSafeInteger(cmd.id) && cmd.id > 0;
      case 'cast': return slot(6) && pos && (cmd.castMode === undefined || ['self', 'point'].includes(cmd.castMode)) &&
        (cmd.recipe === undefined || (cmd.i >= 4 && typeof cmd.recipe === 'string' && /^[QWE]{3}$/.test(cmd.recipe)));
      case 'item': return slot(6) && pos;
      case 'sell': return slot(6);
      case 'buy': return typeof cmd.id === 'string' && owns(ITEMS, cmd.id);
      case 'stop':
      case 'potion':
      case 'recall': return true;
      default: return false;
    }
  }
  const api = { Match, validOrder, buyPlan, shopOffer, sellValue, spellDamage, abilityLevel, abilitySpell,
    abilityError, abilityReadyAt, abilityNeedsTarget, castPoint, weaveRecipe, pickTarget, pickUnit, CREEP_FLAGS, xpGoal, home, distance, physical };
  if (typeof module === 'object') module.exports = api;
  else globalThis.Lanebreak = api;
})();
