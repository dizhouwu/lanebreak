use super::{orders::Command, rules::Difficulty, *};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tactic {
    Kill,
    Trade,
    Push,
    Siege,
    Lane,
}

impl Match {
    fn front_tower(&self, team: usize) -> Option<Id> {
        self.buildings.iter().copied().find(|&id| {
            let b = self.u(id);
            b.team == team && b.kind != "core" && b.hp > 0.0
        })
    }

    fn tower_tanked(&self, tower: Id, hero: Id) -> bool {
        let b = self.u(tower);
        b.target != Some(hero) && self.nearby_creeps(b.pos, self.u(hero).team, b.range).len() >= 2
    }

    fn clear_shot(&self, hero: Id, enemy: Id, width: f64) -> bool {
        let (a, b) = (self.u(hero), self.u(enemy));
        let distance = a.pos.dist(b.pos);
        let length = if distance == 0.0 { 1.0 } else { distance };
        let delta = b.pos.delta(a.pos);
        let (dx, dy) = (delta.x / length, delta.y / length);
        !self.creeps.iter().any(|&id| {
            let c = self.u(id);
            if c.hp <= 0.0 || c.team == a.team {
                return false;
            }
            let d = c.pos.delta(a.pos);
            let along = d.x * dx + d.y * dy;
            along >= 0.0 && along <= length && (d.x * dy - d.y * dx).abs() < width + c.r
        })
    }

    fn creep_cluster(&self, hero: Id, reach: f64, radius: f64) -> Option<Point> {
        let a = self.u(hero);
        let mut best = None;
        let mut count = 2;
        for id in self.nearby_creeps(a.pos, 1 - a.team, reach) {
            let c = self.u(id);
            let cluster = self.nearby_creeps(c.pos, c.team, radius).len();
            if cluster > count {
                best = Some(c.pos);
                count = cluster;
            }
        }
        best
    }

    fn ability_ready(&self, id: Id, slot: usize, mana: f64) -> bool {
        let h = self.h(id);
        h.spell(slot).is_some_and(|s| {
            h.level >= h.unlock(slot)
                && mana >= s.mana
                && match s.kind {
                    Kind::Passive => false,
                    Kind::Brand => {
                        (0..BRAND_CAPACITY).any(|i| h.brand_slot_ready_at(i) <= self.time)
                    }
                    Kind::BrandReturn => h.live_brands(self.time).next().is_some(),
                    _ => h.ready_at(slot) <= self.time,
                }
        })
    }

    fn weave_available(&self, id: Id, recipe: &str, s: &Spell) -> bool {
        let h = self.h(id);
        h.mana >= s.mana
            && h.weave_ready.get(recipe).copied().unwrap_or(0.0) <= self.time
            && (h.cd[3] <= self.time || h.prepared.iter().any(|r| r == recipe))
    }

    fn ai_burst(&self, id: Id, enemy: Id) -> f64 {
        let h = self.h(id);
        let mut mana = h.mana;
        let mut damage = 3.0 * h.attack_damage() * physical(self.u(enemy).armor);
        if let Some(spell) = h.finisher()
            && h.finisher_chain
                .as_ref()
                .is_some_and(|chain| chain.target == enemy && chain.until > self.time)
        {
            damage +=
                h.attack_damage() * (spell.crit_multiplier - 1.0) * physical(self.u(enemy).armor);
        }
        let kit = h.kit();
        let cast_damage = |s: &Spell| {
            if s.kind == Kind::Dagger {
                return (s.damage + s.attack_scale * h.attack_damage())
                    * physical(self.u(enemy).armor);
            }
            0.75 * self.spell_damage(id, s)
                * if s.hits == 0 {
                    1.0
                } else {
                    f64::from(s.hits) * 0.5
                }
        };
        if let Some(weaves) = &kit.weaves {
            return damage
                + weaves
                    .iter()
                    .filter(|(r, s)| self.weave_available(id, r, s))
                    .map(|(_, s)| cast_damage(s))
                    .fold(0.0, f64::max);
        }
        for (slot, s) in kit.abilities.iter().enumerate() {
            if s.damage == 0.0 || !self.ability_ready(id, slot, mana) {
                continue;
            }
            mana -= s.mana;
            damage += cast_damage(s);
        }
        damage
    }

    fn cast_bot_spell(
        &mut self,
        id: Id,
        mut slot: usize,
        at: Point,
        recipe: Option<&str>,
        target: Option<Id>,
    ) -> bool {
        if let Some(recipe) = recipe {
            let prepared = self.h(id).prepared.iter().position(|r| r == recipe);
            if let Some(prepared) = prepared {
                slot = prepared + 4;
            } else {
                let previous = std::mem::replace(
                    &mut self.h_mut(id).marks,
                    recipe
                        .bytes()
                        .map(|key| b"QWE".iter().position(|&b| b == key).unwrap())
                        .collect(),
                );
                if self.command(id, Command::cast(3, at, None)).is_err() {
                    self.h_mut(id).marks = previous;
                    return false;
                }
                slot = 4;
            }
        }
        self.command(id, Command::cast(slot, at, target)).is_ok()
    }

    fn aim(&mut self, target: Id, seconds: f64, d: Difficulty) -> Point {
        let u = self.u(target);
        let (pos, velocity) = (u.pos, u.velocity);
        Point::new(
            pos.x + velocity.x * seconds * d.lead + (self.random() - 0.5) * d.noise,
            pos.y + velocity.y * seconds * d.lead + (self.random() - 0.5) * d.noise,
        )
    }

    fn ai_cast(&mut self, id: Id, enemy: Id, tactic: Tactic, difficulty: Difficulty) -> bool {
        if self.random() > difficulty.cast {
            return false;
        }
        let (a, b) = (self.u(id), self.u(enemy));
        let h = self.h(id);
        let kit = h.kit();
        let enemy_alive = b.hp > 0.0 && !b.veiled(self.time);
        let reach = if enemy_alive {
            a.pos.dist(b.pos)
        } else {
            f64::INFINITY
        };
        let (health, mana) = (a.hp / a.max_hp, h.mana / h.max_mana);
        let attack_damage = h.attack_damage();
        let enemy_health = if enemy_alive { b.hp / b.max_hp } else { 1.0 };
        let kill = tactic == Tactic::Kill;
        let push = tactic == Tactic::Push;
        let (pos, enemy_pos, enemy_team) = (a.pos, b.pos, b.team);
        let return_point = if enemy_alive
            && let Some(return_spell) = h.spell(4).filter(|s| s.kind == Kind::BrandReturn)
            && self.ability_ready(id, 4, h.mana)
        {
            h.live_brands(self.time).find_map(|(_, brand)| {
                (brand.pos.dist(enemy_pos) <= return_spell.radius && pos.dist(brand.pos) > 80.0)
                    .then_some(brand.pos)
            })
        } else {
            None
        };
        if let Some(at) = return_point {
            return self.cast_bot_spell(id, 4, at, None, None);
        }
        let recipes = if kill {
            [
                "QWW", "WEE", "EEE", "QWE", "QQQ", "WWW", "WWE", "QEE", "QQE",
            ]
        } else {
            [
                "WWE", "QQE", "QWW", "WWW", "QQQ", "QEE", "QWE", "WEE", "EEE",
            ]
        };
        let build_resonance = kit.abilities[0].resonance > 0.0
            && !b
                .resonance
                .is_some_and(|mark| mark.source == id && mark.until > self.time);
        let slots = if build_resonance {
            [0, 3, 1, 2]
        } else {
            [3, 1, 0, 2]
        };
        let options: Vec<_> = if let Some(weaves) = &kit.weaves {
            recipes
                .into_iter()
                .map(|r| (3, &weaves[r], Some(r)))
                .collect()
        } else {
            slots
                .into_iter()
                .map(|i| (i, &kit.abilities[i], None))
                .collect()
        };
        for (slot, spell, recipe) in options {
            if let Some(recipe) = recipe {
                if !self.weave_available(id, recipe, spell) {
                    continue;
                }
            } else if !self.ability_ready(id, slot, self.h(id).mana) {
                continue;
            }
            let ultimate = slot == 3 && recipe.is_none();
            let mut target = None;
            let at = match spell.kind {
                Kind::Bolt | Kind::Hook => {
                    if reach < spell.range * 0.85
                        && (kill || mana > 0.35)
                        && (spell.piercing || self.clear_shot(id, enemy, spell.radius))
                    {
                        Some(self.aim(enemy, reach / spell.speed, difficulty))
                    } else if push && spell.piercing && mana > 0.7 {
                        self.creep_cluster(id, spell.range * 0.7, 150.0)
                    } else {
                        None
                    }
                }
                Kind::Unit => {
                    if (kill || mana > 0.4) && self.spell_can_target(id, enemy, spell) {
                        target = Some(enemy);
                        Some(enemy_pos)
                    } else {
                        None
                    }
                }
                Kind::Dagger => {
                    if (kill || mana > 0.35) && self.spell_can_target(id, enemy, spell) {
                        target = Some(enemy);
                    } else if (push || tactic == Tactic::Lane) && mana > 0.6 {
                        let raw = spell.damage + spell.attack_scale * attack_damage;
                        target = self
                            .nearby_creeps(pos, enemy_team, spell.range)
                            .into_iter()
                            .find(|&creep| {
                                let creep = self.u(creep);
                                creep.hp <= raw * physical(creep.armor)
                                    && self.spell_can_target(id, creep.id, spell)
                            });
                    }
                    target.map(|target| self.u(target).pos)
                }
                Kind::Pounce => {
                    if self.spell_can_target(id, enemy, spell)
                        && (kill
                            || tactic == Tactic::Trade && health > 0.52 && health >= enemy_health)
                        && !self.buildings.iter().any(|&tower| {
                            let b = self.u(tower);
                            b.team == enemy_team
                                && b.hp > 0.0
                                && enemy_pos.dist(b.pos) < b.range + 70.0
                        })
                    {
                        target = Some(enemy);
                        Some(enemy_pos)
                    } else {
                        None
                    }
                }
                Kind::Wall => {
                    let facing = self.u(id).facing;
                    let forward = Point::new(facing.cos(), facing.sin());
                    let center = pos.projected(forward, spell.range);
                    (enemy_alive
                        && mana > 0.4
                        && spell.wall_covers(center, forward, enemy_pos, self.u(enemy).r))
                    .then_some(pos)
                }
                Kind::Blast if spell.channel_time > 0.0 => (enemy_alive
                    && reach <= spell.radius
                    && (kill || health > 0.5 && enemy_health < 0.65 && mana > 0.4))
                    .then(|| self.aim(enemy, spell.channel_time, difficulty))
                    .filter(|end| pos.dist(*end) < spell.radius)
                    .map(|_| pos),
                Kind::Meteor | Kind::Blast | Kind::Sweep => {
                    let want = kill
                        || if ultimate {
                            enemy_health < 0.7 && mana > 0.3
                        } else {
                            mana > 0.4
                        };
                    if spell.fixed {
                        let impact = self.cast_point(id, spell, pos);
                        let radius = if spell.trigger_radius > 0.0 {
                            spell.trigger_radius
                        } else {
                            spell.radius
                        };
                        ((want && enemy_alive && impact.dist(enemy_pos) < radius * 0.85)
                            || (push
                                && mana > 0.75
                                && self.nearby_creeps(impact, enemy_team, radius).len() >= 3))
                            .then_some(pos)
                    } else {
                        let in_range = reach
                            < spell.range
                                + spell.radius * if spell.range > 0.0 { 0.4 } else { 0.9 };
                        if in_range && want {
                            Some(self.aim(enemy, spell.delay * 0.8, difficulty))
                        } else if push && !ultimate && mana > 0.75 {
                            self.creep_cluster(id, spell.range, spell.radius)
                        } else {
                            None
                        }
                    }
                }
                Kind::Spirit => ((push || reach < spell.range + 190.0) && mana > 0.52).then_some(
                    Point::new(pos.x + if enemy_team == 1 { 280.0 } else { -280.0 }, pos.y),
                ),
                Kind::Nova | Kind::Chains => ((reach < spell.radius * 0.8 && (kill || mana > 0.3))
                    || (push
                        && mana > 0.7
                        && self
                            .nearby_creeps(pos, enemy_team, spell.radius * 0.9)
                            .len()
                            >= 3))
                    .then_some(pos),
                Kind::Dash => (reach < spell.range + 40.0
                    && reach > 140.0
                    && (kill || (tactic == Tactic::Trade && health > enemy_health && mana > 0.5)))
                    .then_some(enemy_pos),
                Kind::Blink => {
                    (kill && reach > kit.range + 80.0 && reach < spell.range + kit.range * 0.8)
                        .then(|| {
                            pos.projected(enemy_pos.delta(pos), (reach - kit.range * 0.7) / reach)
                        })
                }
                Kind::Mantle => {
                    (reach <= spell.radius + 80.0 && (health < 0.8 || mana > 0.68)).then_some(pos)
                }
                Kind::Brand => (enemy_alive
                    && reach > 180.0
                    && reach < spell.range
                    && (kill || mana > 0.68 && health > enemy_health))
                    .then(|| self.aim(enemy, 0.35, difficulty)),
                Kind::Buff => {
                    let attack = match self.h(id).order {
                        Order::Attack(target) => self.units.get(&target),
                        _ => None,
                    };
                    let siege = attack.is_some_and(|t| t.role == Role::Building);
                    let fighting =
                        attack.is_some_and(|t| t.id == enemy && reach < kit.range + 220.0) || siege;
                    let offensive =
                        stat(&spell.stats, "haste") > 0.0 || stat(&spell.stats, "life") > 0.0;
                    let defensive =
                        stat(&spell.stats, "armor") > 0.0 && health < 0.65 && reach < 650.0;
                    (defensive
                        || fighting
                            && offensive
                            && (!ultimate || kill || enemy_health < 0.6 || siege))
                        .then_some(pos)
                }
                _ => None,
            };
            if let Some(at) = at {
                return self.cast_bot_spell(id, slot, at, recipe, target);
            }
        }
        false
    }

    fn bot_item(&mut self, id: Id, key: &str) {
        if let Some(slot) = self.h(id).inventory.iter().position(|slot| slot.id == key) {
            let _ = self.command(id, Command::Item(slot, self.u(id).pos));
        }
    }

    pub(super) fn think(&mut self, id: Id) {
        let h = self.h(id);
        let d = rules()
            .difficulty
            .get(h.bot.as_deref().unwrap_or("normal"))
            .copied()
            .unwrap_or(rules().difficulty["normal"]);
        let kit = h.kit();
        let t = self.time;
        self.h_mut(id).think = t + d.react * (0.7 + self.random() * 0.6);
        let u = self.u(id);
        let team = u.team;
        let enemy_team = 1 - team;
        if self.team_match {
            return self.think_team(id, d);
        }
        let enemy = self.heroes[enemy_team];
        let (own, enemy_home) = (self.home(team), self.home(enemy_team));
        let b = self.u(enemy);
        let enemy_alive = b.hp > 0.0 && !b.veiled(t);
        let enemy_dist = if enemy_alive {
            u.pos.dist(b.pos)
        } else {
            f64::INFINITY
        };
        let hp = u.hp / u.max_hp;
        let mana = self.h(id).mana / self.h(id).max_mana;
        let enemy_hp = b.hp / b.max_hp;
        let home_dist = u.pos.dist(own);
        let dir = if team == 0 { 1.0 } else { -1.0 };
        if (u.hp == 0.0 || home_dist < 400.0) && u.windup.is_none() {
            if let Some(key) = kit.build.get(self.h(id).build_index)
                && self.buy(id, key).is_ok()
            {
                self.h_mut(id).build_index += 1;
            }
        }
        let u = self.u(id);
        if u.hp == 0.0 || u.windup.is_some() || u.dash.is_some() || u.stun_until > t {
            return;
        }
        if hp < 0.50 {
            self.bot_item(id, "locket");
        }
        if hp < 0.28 || (hp < 0.45 && enemy_dist < 700.0 && enemy_hp > hp + 0.25) {
            self.h_mut(id).retreat = true;
        }
        if self.h(id).retreat {
            if home_dist < 300.0 {
                if hp <= 0.92 || mana <= 0.70 {
                    return;
                }
                self.h_mut(id).retreat = false;
            } else {
                if self.h(id).channel != 0.0
                    || (home_dist > 1600.0
                        && enemy_dist > 800.0
                        && self.command(id, Command::Recall).is_ok())
                {
                    return;
                }
                if enemy_dist < 800.0 {
                    self.bot_item(id, "striders");
                }
                if enemy_dist < 700.0 {
                    let pos = self.u(id).pos;
                    let away = Point::new(pos.x - dir * 1000.0, pos.y);
                    if let Some(weaves) = &kit.weaves {
                        if !self.u(id).veiled(t) && self.weave_available(id, "QQW", &weaves["QQW"])
                        {
                            self.cast_bot_spell(id, 3, pos, Some("QQW"), None);
                        }
                    } else if let Some(i) =
                        kit.abilities.iter().enumerate().position(|(i, spell)| {
                            self.ability_ready(id, i, self.h(id).mana)
                                && (matches!(spell.kind, Kind::Dash | Kind::Blink)
                                    || spell.kind == Kind::Veil && !self.u(id).veiled(t)
                                    || spell.kind == Kind::Buff
                                        && (stat(&spell.stats, "move") > 0.0
                                            || stat(&spell.stats, "armor") > 0.0))
                        })
                    {
                        self.cast_bot_spell(id, i, away, None, None);
                    }
                }
                let _ = self.command(id, Command::Move(own));
                return;
            }
        }
        let towers: Vec<_> = self
            .buildings
            .iter()
            .copied()
            .filter(|&tower| {
                let b = self.u(tower);
                b.team == enemy_team && b.kind != "core" && b.hp > 0.0
            })
            .collect();
        let pos = self.u(id).pos;
        let enemy_pos = self.u(enemy).pos;
        if let Some(tower) = towers.iter().copied().rev().find(|&tower| {
            let b = self.u(tower);
            pos.dist(b.pos) < b.range + 90.0
        }) && !self.tower_tanked(tower, id)
        {
            let b = self.u(tower);
            let _ = self.command(
                id,
                Command::Move(Point::new(
                    b.pos.x - dir * (b.range + 230.0),
                    pos.y.clamp(330.0, 570.0),
                )),
            );
            return;
        }
        if (pos.x - enemy_home.x).abs() < 480.0 {
            let _ = self.command(id, Command::Move(Point::new(pos.x - dir * 300.0, pos.y)));
            return;
        }
        let allies = self.nearby_creeps(pos, team, 500.0).len();
        let enemies = self.nearby_creeps(pos, enemy_team, 500.0).len();
        if enemy_dist < 1100.0 {
            let shelter = towers.iter().copied().find(|&tower| {
                let b = self.u(tower);
                enemy_pos.dist(b.pos) < b.range + 60.0
            });
            let safe = shelter.is_some_and(|tower| !self.tower_tanked(tower, id))
                || (enemy_pos.x - enemy_home.x).abs() < 620.0;
            if !safe && hp > 0.30 && self.u(enemy).hp < self.ai_burst(id, enemy) * d.kill_judge {
                if enemy_dist > kit.range + 60.0 {
                    self.bot_item(id, "striders");
                }
                let _ = self.command(id, Command::Attack(enemy));
                self.ai_cast(id, enemy, Tactic::Kill, d);
                return;
            }
        }
        let mut last_hit = None;
        let mut score = 0.0;
        let mut weakest = None;
        for &creep in &self.creeps {
            let c = self.u(creep);
            if c.hp <= 0.0 || c.pos.dist(pos) > kit.range + 320.0 {
                continue;
            }
            let stats = &self.h(id).stats;
            let hit_damage = stat(stats, "damage") * stat(stats, "multiplier") * physical(c.armor);
            if c.spirit.is_some() {
                if c.team != team && c.hp <= hit_damage && score == 0.0 {
                    last_hit = Some(creep);
                    score = 1.0;
                }
                continue;
            }
            if c.team != team {
                if c.roll[team] >= d.last_hit && c.hp < c.max_hp * 0.30 {
                    continue;
                }
                if c.hp <= hit_damage * 1.08 && c.gold > score {
                    last_hit = Some(creep);
                    score = c.gold;
                }
                if weakest.is_none_or(|id| c.hp < self.u(id).hp) {
                    weakest = Some(creep);
                }
            } else if d.deny && c.hp < hit_damage && c.hp < c.max_hp / 2.0 && score < 5.0 {
                last_hit = Some(creep);
                score = 5.0;
            }
        }
        if let Some(target) = last_hit {
            let _ = self.command(id, Command::Attack(target));
            return;
        }
        let own_tower = self.front_tower(team);
        let enemy_tower = towers.first().copied();
        let objective = enemy_tower.or_else(|| self.building(enemy_team, "core"));
        if let Some(target) = objective
            && enemies <= 1
            && self.u(id).reach(self.u(target)) <= kit.range + 300.0
            && enemy_tower.is_none_or(|tower| self.tower_tanked(tower, id))
        {
            self.bot_item(id, "horn");
            let _ = self.command(id, Command::Attack(target));
            self.ai_cast(id, enemy, Tactic::Siege, d);
            return;
        }
        let defend = own_tower.is_none_or(|tower| {
            let b = self.u(tower);
            !self.nearby_creeps(b.pos, enemy_team, b.range).is_empty()
        });
        let push = !enemy_alive
            || enemy_dist > 1500.0
            || self.h(id).level >= self.h(enemy).level + 2
            || t > 420.0
            || defend;
        let trade = enemy_alive
            && enemy_dist - self.u(enemy).r
                <= kit.range + if kit.range > 150.0 { 60.0 } else { 260.0 }
            && hp >= enemy_hp - 0.15
            && enemies <= allies + 1
            && self.random() < d.harass;
        if trade {
            let _ = self.command(id, Command::Attack(enemy));
            self.ai_cast(id, enemy, Tactic::Trade, d);
            return;
        }
        if self.ai_cast(id, enemy, if push { Tactic::Push } else { Tactic::Lane }, d) {
            return;
        }
        if push && let Some(target) = weakest {
            let _ = self.command(id, Command::Attack(target));
            return;
        }
        let pos = self.u(id).pos;
        if let Some(orb) = self.orb
            && (pos.x - orb.pos.x).abs() < 700.0
            && hp > 0.5
            && (!enemy_alive || enemy_pos.dist(orb.pos) > pos.dist(orb.pos))
            && self.random() < 0.5
        {
            let _ = self.command(id, Command::Move(orb.pos));
            return;
        }
        let front = self
            .creeps
            .iter()
            .copied()
            .map(|id| self.u(id))
            .filter(|c| c.hp > 0.0 && c.team == team)
            .map(|c| c.pos.x * dir)
            .fold(f64::NEG_INFINITY, f64::max);
        let base = own_tower.map_or_else(
            || {
                self.building(team, "core")
                    .map_or(own.x, |b| self.u(b).pos.x)
                    * dir
                    + 220.0
            },
            |tower| self.u(tower).pos.x * dir + 40.0,
        );
        let follow = if front == f64::NEG_INFINITY {
            base
        } else {
            (front - if kit.range > 150.0 { 230.0 } else { 30.0 }).max(base - 150.0)
        };
        let limit = if let Some(tower) = enemy_tower {
            if self.tower_tanked(tower, id) {
                f64::INFINITY
            } else {
                let b = self.u(tower);
                b.pos.x * dir - b.range - 140.0
            }
        } else {
            enemy_home.x * dir - 640.0
        };
        if self.random() < 0.2 {
            self.h_mut(id).sway = (self.random() - 0.5) * 220.0;
        }
        let hold = Point::new(follow.min(limit) * dir, 450.0 + self.h(id).sway);
        if pos.dist(hold) > 50.0 {
            let _ = self.command(id, Command::Move(hold));
        }
    }

    fn think_team(&mut self, id: Id, difficulty: Difficulty) {
        let u = self.u(id);
        let (team, lane, pos) = (u.team, u.lane, u.pos);
        let home = self.home(team);
        let health = u.hp / u.max_hp;
        if pos.dist(home) < 400.0 || u.hp <= 0.0 {
            let h = self.h(id);
            if let Some(key) = h.kit().build.get(h.build_index)
                && self.buy(id, key).is_ok()
            {
                self.h_mut(id).build_index += 1;
            }
        }
        let u = self.u(id);
        if u.hp <= 0.0 || u.windup.is_some() || u.dash.is_some() || u.stun_until > self.time {
            return;
        }
        if health < 0.30 || (self.h(id).retreat && health < 0.9) {
            self.h_mut(id).retreat = true;
            if let Some(slot) = self
                .h(id)
                .kit()
                .abilities
                .iter()
                .position(|spell| spell.kind == Kind::Veil)
                && !self.u(id).veiled(self.time)
                && self.ability_ready(id, slot, self.h(id).mana)
                && self.nearest(id, 550.0, |b| b.role == Role::Hero).is_some()
            {
                self.cast_bot_spell(id, slot, pos, None, None);
            }
            let _ = self.command(id, Command::Move(home));
            return;
        }
        self.h_mut(id).retreat = false;
        let progress = self.lane_progress(team, lane, pos);
        let next = self.lane_point(team, lane, progress + 245.0);
        let enemy_tower = ["outer", "inner"]
            .into_iter()
            .filter_map(|kind| self.lane_building(1 - team, lane, kind))
            .find(|&tower| self.u(tower).hp > 0.0);
        if let Some(tower) = enemy_tower {
            let b = self.u(tower);
            if pos.dist(b.pos) <= b.range + 100.0 && !self.tower_tanked(tower, id) {
                let retreat = self.lane_point(team, lane, (progress - 300.0).max(0.0));
                let _ = self.command(id, Command::Move(retreat));
                return;
            }
        }
        if let Some(enemy) = self.nearest(id, 750.0, |b| b.role == Role::Hero) {
            if self.ai_cast(id, enemy, Tactic::Trade, difficulty) {
                return;
            }
            if self.u(id).reach(self.u(enemy)) <= self.u(id).attack_range() + 140.0 {
                let _ = self.command(id, Command::Attack(enemy));
                return;
            }
        }
        if let Some(creep) = self.nearest(id, 550.0, |b| b.role == Role::Creep) {
            let _ = self.command(id, Command::Attack(creep));
            return;
        }
        if let Some(target) = enemy_tower.or_else(|| self.building(1 - team, "core"))
            && !self.protected(target)
            && self.u(id).reach(self.u(target)) < self.u(id).attack_range() + 130.0
        {
            let _ = self.command(id, Command::Attack(target));
            return;
        }
        let _ = self.command(id, Command::Advance(next));
    }
}
