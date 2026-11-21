/* Shared tuning tables for the browser and match server. */
(function () {
  const HEROES = {
    vesper: {
      name: 'Vesper', title: 'Tide Archer', role: 'Ranged attacker', color: '#35c9c0',
      hp: 540, hpGrowth: 72, mana: 280, manaGrowth: 28, damage: 47, damageGrowth: 3.9,
      armor: 2, armorGrowth: .4, range: 510, interval: 1.2, speedGrowth: .03, speed: 300, regen: 1.6, manaRegen: .9,
      abilities: [
        { name: 'Piercing Shot', kind: 'bolt', mana: 70, cd: 8, range: 900, radius: 30, speed: 1500, piercing: true, damage: 80, growth: 20, text: 'Fire an arrow through every enemy in its path.' },
        { name: 'Snare Net', kind: 'blast', mana: 80, cd: 13, range: 700, radius: 190, delay: .5, damage: 40, growth: 10, slow: .45, slowTime: 2.5, text: 'Snare enemies in an area, dealing damage and slowing them.' },
        { name: 'Tailwind', kind: 'buff', mana: 50, cd: 16, duration: 5, stats: { move: .30, haste: .50 }, text: 'Gain movement and attack speed for 5 seconds.' },
        { name: 'Arrow Storm', kind: 'blast', mana: 160, cd: 70, range: 800, radius: 250, delay: .4, hits: 6, interval: .5, damage: 45, growth: 9, text: 'Rain six volleys of arrows onto the target area.' }
      ],
      build: ['boots', 'gloves', 'striders', 'stone', 'greatblade', 'executioner', 'fang', 'reaver', 'charm', 'heartstone', 'colossus', 'crown']
    },
    brakk: {
      name: 'Brakk', title: 'Iron Ram', role: 'Melee bruiser', color: '#d98a3a',
      hp: 780, hpGrowth: 105, mana: 220, manaGrowth: 20, damage: 63, damageGrowth: 5,
      armor: 5, armorGrowth: .7, range: 110, interval: 1.3, speedGrowth: .025, speed: 312, regen: 3.4, manaRegen: .7,
      abilities: [
        { name: 'Ram Charge', kind: 'dash', mana: 70, cd: 10, range: 580, radius: 120, speed: 1500, damage: 80, growth: 20, stun: 1.3, text: 'Charge to a point, damaging and stunning enemies on impact.' },
        { name: 'Ground Slam', kind: 'nova', mana: 75, cd: 9, radius: 250, damage: 80, growth: 20, slow: .40, slowTime: 2, text: 'Strike the ground, damaging and slowing nearby enemies.' },
        { name: 'Iron Hide', kind: 'buff', mana: 50, cd: 18, duration: 6, stats: { armor: 10, regen: 14 }, text: 'Gain 10 armor and 14 HP regen for 6 seconds.' },
        { name: 'Last Stand', kind: 'buff', mana: 120, cd: 75, duration: 8, stats: { haste: .60, life: .40, move: .20 }, text: 'Gain attack speed, lifesteal, and movement speed for 8 seconds.' }
      ],
      build: ['boots', 'charm', 'vest', 'bulwark', 'fang', 'reaver', 'gloves', 'striders', 'heartstone', 'colossus', 'greatblade', 'crown']
    },
    orrin: {
      name: 'Orrin', title: 'Gravity Sage', role: 'Ranged caster', color: '#9a6bff',
      hp: 530, hpGrowth: 65, mana: 360, manaGrowth: 40, damage: 46, damageGrowth: 3.2,
      armor: 1.5, armorGrowth: .3, range: 580, interval: 1.4, speedGrowth: .02, speed: 290, regen: 1.4, manaRegen: 1.3,
      abilities: [
        { name: 'Graviton', kind: 'bolt', mana: 60, cd: 6, range: 850, radius: 26, speed: 1300, damage: 90, growth: 20, slow: .30, slowTime: 1.5, text: 'Fire a bolt that damages and slows the first enemy hit.' },
        { name: 'Collapse', kind: 'blast', mana: 95, cd: 13, range: 750, radius: 170, delay: .9, damage: 100, growth: 22, stun: 1.1, text: 'Collapse gravity at a point, damaging and stunning enemies.' },
        { name: 'Phase Step', kind: 'blink', mana: 60, cd: 14, range: 600, text: 'Teleport up to 600 units toward the selected point.' },
        { name: 'Starfall', kind: 'blast', mana: 200, cd: 80, range: 900, radius: 240, delay: 1.4, damage: 250, growth: 38, text: 'Bring down a star after a 1.4-second delay.' }
      ],
      build: ['boots', 'prism', 'rune', 'arcane', 'void', 'charm', 'locket', 'heartstone', 'gloves', 'frost', 'bulwark']
    },
    sable: {
      name: 'Sable', title: 'Glass Duelist', role: 'Mobile melee assassin', color: '#f28e9d',
      hp: 690, hpGrowth: 92, mana: 280, manaGrowth: 25, damage: 62, damageGrowth: 5.1,
      armor: 3.5, armorGrowth: .5, range: 125, interval: 1.10, speedGrowth: .035, speed: 320, regen: 2.9, manaRegen: 1.05,
      abilities: [
        { name: 'Crosscut', kind: 'dash', mana: 65, cd: 9, range: 515, radius: 100, speed: 1750, damage: 75, growth: 17, stun: .55, text: 'Dash to a point, damaging and briefly stunning enemies where you land.' },
        { name: 'Splinter', kind: 'bolt', mana: 65, cd: 10, range: 690, radius: 38, speed: 1450, piercing: true, damage: 91, growth: 19, text: 'Send a shard through enemies in a line.' },
        { name: 'Quickdraw', kind: 'buff', mana: 60, cd: 17, duration: 4, stats: { haste: .65, move: .20 }, text: 'Gain attack and movement speed for 4 seconds.' },
        { name: 'Shatterline', kind: 'bolt', mana: 145, cd: 65, range: 1050, radius: 33, speed: 1900, piercing: true, damage: 225, growth: 30, text: 'Hurl a glass blade that deals heavy damage to every enemy it pierces.' }
      ],
      build: ['boots', 'gloves', 'striders', 'fang', 'reaver', 'stone', 'greatblade', 'executioner', 'charm', 'crown', 'heartstone']
    },
    mirel: {
      name: 'Mirel', title: 'Fen Warden', role: 'Ranged zone control', color: '#a3cf70',
      hp: 645, hpGrowth: 86, mana: 310, manaGrowth: 31, damage: 52, damageGrowth: 3.8,
      armor: 3, armorGrowth: .45, range: 460, interval: 1.28, speedGrowth: .018, speed: 294, regen: 2.7, manaRegen: 1.15,
      abilities: [
        { name: 'Reed Dart', kind: 'bolt', mana: 55, cd: 7, range: 780, radius: 24, speed: 1250, damage: 73, growth: 17, slow: .25, slowTime: 1.4, text: 'Fire a slowing dart at the first enemy in its path.' },
        { name: 'Rootbed', kind: 'blast', mana: 85, cd: 14, range: 690, radius: 205, delay: .45, hits: 3, interval: .65, damage: 34, growth: 8, slow: .30, slowTime: 1.1, text: 'Grow a patch of roots that damages and slows enemies in three pulses.' },
        { name: 'Greenward', kind: 'buff', mana: 65, cd: 22, duration: 5, stats: { armor: 6, regen: 19 }, text: 'Gain 6 armor and 19 health regen for 5 seconds.' },
        { name: 'Briar Crown', kind: 'blast', mana: 175, cd: 72, range: 720, radius: 230, delay: .75, hits: 4, interval: .75, damage: 41, growth: 8, stun: .32, text: 'Raise a briar thicket that pulses four times, briefly stunning enemies inside.' }
      ],
      build: ['boots', 'prism', 'charm', 'locket', 'rune', 'arcane', 'vest', 'bulwark', 'void', 'heartstone', 'colossus']
    },
    neris: {
      name: 'Neris', title: 'Loomkeeper', role: 'Combo spellcaster', color: '#f0c865',
      hp: 595, hpGrowth: 78, mana: 350, manaGrowth: 39, damage: 49, damageGrowth: 3.7,
      armor: 2, armorGrowth: .38, range: 530, interval: 1.30, speedGrowth: .023, speed: 299, regen: 1.9, manaRegen: 1.65,
      unlocks: [1, 1, 1, 1, 1, 1],
      abilities: [
        { name: 'Thread', kind: 'mark', mana: 0, cd: 0, text: 'Add a Thread mark. Weave uses your latest three marks.' },
        { name: 'Needle', kind: 'mark', mana: 0, cd: 0, text: 'Add a Needle mark. Weave uses your latest three marks.' },
        { name: 'Knot', kind: 'mark', mana: 0, cd: 0, text: 'Add a Knot mark. Weave uses your latest three marks.' },
        { name: 'Weave', kind: 'invoke', mana: 0, cd: 3, text: 'Turn three marks into a prepared spell. The new spell moves to D and the previous spell moves to F.' },
        { name: 'Empty slot', kind: 'prepared', mana: 0, cd: 0, text: 'Prepare a spell with R to cast it from this slot.' },
        { name: 'Empty slot', kind: 'prepared', mana: 0, cd: 0, text: 'Prepare a second spell with R to fill both slots.' }
      ],
      weaves: {
        QQQ: { name: 'Pin Stitch', kind: 'bolt', mana: 65, cd: 11, range: 720, radius: 29, speed: 1550, damage: 59, growth: 14, stitch: true, text: 'Tag the first enemy hero hit for 4 seconds. Your follow-up hits can briefly stagger them up to three times.' },
        QQW: { name: 'Crosswind', kind: 'bolt', mana: 85, cd: 15, range: 940, radius: 45, speed: 1150, piercing: true, damage: 72, growth: 17, stun:.8, text: 'Send a cutting gust through the lane, damaging and briefly stunning enemies it crosses.' },
        QQE: { name: 'Fray Screen', kind: 'blast', mana: 75, cd: 13, range: 650, radius: 195, delay: .3, hits: 4, interval: .65, damage: 24, growth: 6, slow: .34, slowTime:1, text: 'Leave a tangle on the ground that damages and slows enemies in four pulses.' },
        QWW: { name: 'Loose End', kind: 'blink', mana: 65, cd: 15, range: 510, text: 'Teleport up to 510 units toward the selected point.' },
        QWE: { name: 'Spool Break', kind: 'bolt', mana: 100, cd: 18, range: 760, radius: 41, speed: 1400, piercing: true, damage: 81, growth: 18, push:115, disarm:1.2, text: 'Fire a piercing shockwave that pushes enemies away. Hero basic attacks are disabled for 1.2 seconds.' },
        QEE: { name: 'Needle Post', kind: 'sentry', mana: 85, cd: 20, range: 610, duration: 10, health:270, shot:30, shotGrowth:3, text: 'Plant a destructible sentry for 10 seconds. It fires at nearby enemy heroes and creeps.' },
        WWW: { name: 'Hollow Seam', kind: 'blast', mana: 90, cd: 17, range: 750, radius: 220, delay: 1.1, damage: 88, growth: 19, drain:80, text: 'Mark an area that bursts after a delay, dealing damage and draining up to 80 mana from enemy heroes inside.' },
        WWE: { name: 'Tighten Thread', kind: 'buff', mana: 65, cd: 17, duration: 4.5, stats: { haste:.46, damage:20 }, text: 'Gain 46% attack speed and 20 attack damage for 4.5 seconds.' },
        WEE: { name: 'Rolling Stitch', kind: 'blast', mana: 110, cd: 18, range: 440, radius: 150, delay: .6, hits: 4, interval: .42, travel:130, damage: 40, growth: 8, text: 'Send four bursts rolling in the cast direction. Each advances 130 units from the previous one.' },
        EEE: { name: 'Sky Needle', kind: 'blast', mana: 115, cd: 20, range: 1420, radius: 128, delay: 1.05, damage: 155, growth: 26, text: 'Call down a narrow, delayed strike up to 1,420 units away.' }
      },
      build: ['boots', 'prism', 'rune', 'arcane', 'charm', 'locket', 'void', 'vest', 'bulwark', 'heartstone']
    },
    cairn: {
      name: 'Cairn', title: 'Kiln Keeper', role: 'Ranged burst carry', color: '#ff9962',
      hp: 585, hpGrowth: 79, mana: 315, manaGrowth: 32, damage: 49, damageGrowth: 3.9,
      armor: 2.5, armorGrowth: .42, range: 490, interval: 1.19, speedGrowth: .027, speed: 301, regen: 1.9, manaRegen: 1.25,
      heat: { max:6, attack:3 },
      unlocks: [1, 1, 1, 6],
      abilities: [
        { name: 'Flashpan', kind: 'blast', fixed: true, mana: 55, cd: 9, range: 235, radius: 130, delay: .22, damage: 75, growth: 18, text: 'Trigger the near blast 235 units in the direction Cairn is facing.' },
        { name: 'Flue Burst', kind: 'blast', fixed: true, mana: 65, cd: 9, range: 460, radius: 145, delay: .29, damage: 89, growth: 20, text: 'Trigger the middle blast 460 units in the direction Cairn is facing.' },
        { name: 'Chimney Shot', kind: 'blast', fixed: true, mana: 75, cd: 9, range: 700, radius: 155, delay: .36, damage: 103, growth: 22, text: 'Trigger the far blast 700 units in the direction Cairn is facing.' },
        { name: 'Furnace Vent', kind: 'blast', mana: 145, cd: 68, range: 0, radius: 340, delay: .70, damage: 135, growth: 26, heatDamage: 18, text: 'Release a delayed blast around the point where you cast. Spend all Heat for 18 extra base damage per stack.' }
      ],
      build: ['boots', 'gloves', 'striders', 'stone', 'greatblade', 'executioner', 'prism', 'arcane', 'void', 'charm', 'heartstone']
    }
  };
  const ITEMS = {
    potion: { color: '#e2506a', name: 'Mend Potion', cost: 90, text: 'Restores 300 HP over 10s.' },
    tome: { color: '#cdb46a', name: 'Tome of Insight', cost: 280, text: '+220 XP immediately. Restocks in 150s.' },
    stone: { color: '#b9c2cc', name: 'Whetstone', cost: 320, stats: { damage: 12 }, text: '+12 damage' },
    gloves: { color: '#e8d15a', name: 'Swift Gloves', cost: 520, stats: { haste: .25 }, text: '+25% attack speed' },
    fang: { color: '#c0396b', name: 'Vampire Fang', cost: 600, stats: { life: .10 }, text: '+10% lifesteal' },
    boots: { color: '#c98f4e', name: "Runner’s Boots", cost: 450, stats: { speed: 50 }, text: '+50 movement speed' },
    charm: { color: '#e86f6f', name: 'Vital Charm', cost: 420, stats: { hp: 220, regen: 2 }, text: '+220 HP, +2 HP regen' },
    vest: { color: '#8d98a8', name: 'Plate Vest', cost: 520, stats: { armor: 5 }, text: '+5 armor' },
    prism: { color: '#5aa2ff', name: 'Mana Prism', cost: 400, stats: { mana: 200, manaRegen: 1.5 }, text: '+200 mana, +1.5 mana regen' },
    rune: { color: '#b07bff', name: 'Focus Rune', cost: 450, stats: { power: .10 }, text: '+10% ability damage' },
    greatblade: { color: '#dfe6ee', name: 'Greatblade', parts: ['stone', 'stone'], cost: 500, stats: { damage: 40 }, text: '+40 damage' },
    reaver: { color: '#d0703a', name: 'Reaver Axe', parts: ['stone', 'fang'], cost: 450, stats: { damage: 18, life: .10, splash: .40 }, text: '+18 damage, +10% lifesteal. Attacks splash nearby enemies.' },
    horn: { color: '#b8963e', name: 'War Horn', parts: ['stone', 'vest'], cost: 400, cd: 45, stats: { damage: 14, armor: 5 }, text: '+14 damage, +5 armor. Active empowers nearby allied creeps for 8s.' },
    striders: { color: '#f0a23c', name: 'Storm Striders', parts: ['boots', 'gloves'], cost: 350, cd: 30, stats: { speed: 70, haste: .30 }, text: '+70 movement, +30% attack speed. Active grants +35% movement for 4s.' },
    frost: { color: '#7fd6f0', name: 'Frost Brand', parts: ['gloves', 'rune'], cost: 450, stats: { haste: .25, power: .10, chill: .20 }, text: '+25% attack speed, +10% ability damage. Attacks slow for 1.5s.' },
    crown: { color: '#a01f4a', name: 'Blood Crown', parts: ['fang', 'charm'], cost: 500, stats: { life: .20, hp: 260 }, text: '+20% lifesteal, +260 HP' },
    heartstone: { color: '#ff4d4d', name: 'Heartstone', parts: ['charm', 'charm'], cost: 550, stats: { hp: 560, regen: 8 }, text: '+560 HP, +8 HP regen' },
    bulwark: { color: '#6f7f95', name: 'Bulwark Plate', parts: ['vest', 'charm'], cost: 450, stats: { armor: 9, hp: 300, reflect: .20 }, text: '+9 armor, +300 HP. Reflects 20% of incoming hero attacks.' },
    locket: { color: '#58c98a', name: 'Mending Locket', parts: ['charm', 'prism'], cost: 350, cd: 50, stats: { hp: 260, mana: 220, regen: 2, manaRegen: 1.5 }, text: '+260 HP, +220 mana and regen. Active restores 280 HP and 120 mana.' },
    arcane: { color: '#8f5bff', name: 'Arcane Core', parts: ['prism', 'rune'], cost: 450, stats: { power: .25, mana: 250, manaRegen: 2 }, text: '+25% ability damage, +250 mana, +2 mana regen' },
    rift: { color: '#3fd0c9', name: 'Rift Stone', cost: 1400, cd: 16, text: 'Active teleports up to 520 units. Locked for 2.5s after hero or tower damage.' },
    executioner: { color: '#f2f2f2', name: 'Executioner’s Edge', parts: ['greatblade', 'gloves'], cost: 500, stats: { damage: 48, haste: .25, crit: .25 }, master: true, text: '+48 damage, +25% attack speed. 25% chance to deal 1.8× attack damage.' },
    colossus: { color: '#d43a3a', name: 'Colossus Heart', parts: ['heartstone', 'vest'], cost: 500, stats: { hp: 720, regen: 10, armor: 7, recover: .025 }, master: true, text: '+720 HP, +10 HP regen, +7 armor. Regenerates 2.5% max HP/s out of combat.' },
    void: { color: '#5b2fd6', name: 'Void Core', parts: ['arcane', 'rune'], cost: 550, stats: { power: .40, mana: 320, manaRegen: 3, cdr: .20 }, master: true, text: '+40% ability damage, +320 mana, +3 mana regen, 20% cooldown reduction.' }
  };
  for (const item of Object.values(ITEMS)) item.total = item.cost + (item.parts || []).reduce((sum, id) => sum + ITEMS[id].total, 0);
  const CREEPS = {
    melee: { hp: 420, damage: 20, armor: 2, range: 70, interval: 1, speed: 235, r: 15, gold: 36, xp: 45 },
    ranged: { hp: 280, damage: 30, armor: 0, range: 430, interval: 1.2, speed: 235, r: 13, gold: 44, xp: 60 },
    siege: { hp: 750, damage: 40, armor: 0, range: 560, interval: 2.2, speed: 210, r: 20, gold: 70, xp: 80 }
  };
  const DIFF = {
    easy: { react: .60, lastHit: .4, deny: false, cast: .25, lead: .2, noise: 130, harass: .10, killJudge: .50 },
    normal: { react: .38, lastHit: .6, deny: false, cast: .5, lead: .5, noise: 70, harass: .25, killJudge: .70 },
    hard: { react: .14, lastHit: 1, deny: true, cast: 1, lead: 1, noise: 10, harass: .35, killJudge: .95 }
  };
  const RULES = { HEROES, ITEMS, CREEPS, DIFF, WIDTH: 5200, HEIGHT: 1000,
    TEAM: ['Azure', 'Crimson'], COLORS: ['#61cfff', '#fc7377'],
    ORBS: { Haste: '#5ae6e2', Might: '#ff7d67', Renewal: '#93e78d', Wealth: '#ffcb6c' },
    UNLOCKS: [1, 2, 3, 6], WEAVE_MARKS: 3 };
  if (typeof module === 'object') module.exports = RULES;
  else globalThis.LanebreakRules = RULES;
})();
