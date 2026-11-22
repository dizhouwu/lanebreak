use super::*;

impl Match {
    pub(super) fn nearby_creeps(&self, center: Point, team: usize, radius: f64) -> Vec<Id> {
        let limit = radius * radius;
        self.creeps
            .iter()
            .copied()
            .filter(|&id| {
                let u = self.u(id);
                u.hp > 0.0 && u.team == team && u.pos.squared(center) < limit
            })
            .collect()
    }

    pub(super) fn nearest(
        &self,
        id: Id,
        radius: f64,
        filter: impl Fn(&Unit) -> bool,
    ) -> Option<Id> {
        let u = self.u(id);
        let mut best = None;
        let mut closest = radius;
        for other in self.units.values() {
            if other.hp <= 0.0
                || other.team == u.team
                || other.cyclone_until > self.time
                || other.veiled(self.time)
            {
                continue;
            }
            let reach = closest + other.r;
            if reach < 0.0 || u.pos.squared(other.pos) > reach * reach + 1e-8 {
                continue;
            }
            if self.protected(other.id) || !filter(other) {
                continue;
            }
            let d = u.reach(other);
            if d <= closest {
                closest = d;
                best = Some(other.id);
            }
        }
        best
    }

    fn walk(&mut self, id: Id, target: Point, speed: f64, dt: f64) {
        let u = self.u(id);
        let origin = u.pos;
        let mut pos = origin.towards(target, speed * dt, 0.0, true, self.height());
        for &building in &self.buildings {
            let b = self.u(building);
            let clearance = b.r + u.r;
            let delta = pos.delta(b.pos);
            if u.dash.is_some()
                || b.hp <= 0.0
                || delta.x.abs() >= clearance
                || delta.y.abs() >= clearance
            {
                continue;
            }
            let (new_dist, old_dist) = (pos.dist(b.pos), origin.dist(b.pos));
            if new_dist >= clearance || new_dist >= old_dist {
                continue;
            }
            let d = if old_dist == 0.0 { 1.0 } else { old_dist };
            let n = origin.delta(b.pos);
            let (nx, ny) = (n.x / d, n.y / d);
            let to = target.delta(origin);
            let tangent = to.x * -ny + to.y * nx;
            let dir = if tangent != 0.0 {
                tangent.signum()
            } else if u.team == 0 {
                -1.0
            } else {
                1.0
            };
            let avoid = Point::new(
                origin.x + (0.18 * nx - dir * ny) * speed * dt,
                origin.y + (0.18 * ny + dir * nx) * speed * dt,
            );
            pos = origin.towards(avoid, f64::INFINITY, 0.0, true, self.height());
        }
        let delta = pos.delta(origin);
        let u = self.u_mut(id);
        u.velocity = Point::new(delta.x / dt, delta.y / dt);
        if u.velocity.x.abs() + u.velocity.y.abs() > 0.01 {
            u.facing = u.velocity.y.atan2(u.velocity.x);
        }
        u.pos = pos;
    }

    fn spawn(&mut self) {
        let wave = self.wave;
        self.wave += 1;
        let siege = wave > 0
            && wave.is_multiple_of(if wave >= 40 {
                1
            } else if wave >= 24 {
                2
            } else {
                5
            });
        for team in 0..=1 {
            for lane in 0..if self.team_match { 3 } else { 1 } {
                let boost = if self
                    .lane_building(1 - team, lane, "inner")
                    .is_some_and(|id| self.u(id).hp <= 0.0)
                {
                    1.5
                } else {
                    1.0
                };
                let rows: &[f64] = if wave < 24 {
                    &[-60.0, 0.0, 60.0]
                } else {
                    &[-75.0, -25.0, 25.0, 75.0]
                };
                for &dy in rows {
                    self.spawn_creep(wave, team, lane, boost, "melee", (0.0, dy));
                }
                self.spawn_creep(wave, team, lane, boost, "ranged", (90.0, -40.0));
                if siege {
                    self.spawn_creep(wave, team, lane, boost, "siege", (150.0, 40.0));
                }
            }
        }
    }

    fn spawn_creep(
        &mut self,
        wave: u32,
        team: usize,
        lane: usize,
        boost: f64,
        kind: &'static str,
        (back, dy): (f64, f64),
    ) {
        let base = &rules().creeps[kind];
        let n = f64::from(wave);
        let hp = base.hp * (1.0 + 0.035 * n) * boost;
        let x = 650.0 - back;
        let lane_y = 450.0 + dy;
        let pos = if self.team_match {
            self.lane_point(team, lane, 165.0 - back)
                .projected(Point::new(1.0, 1.0), dy * 0.65)
        } else {
            Point::new(if team == 0 { x } else { rules().width - x }, lane_y)
        };
        let roll = [self.random(), self.random()];
        let attack_ready = self.time + self.random() * 0.5;
        let id = self.insert(Unit {
            kind,
            team,
            pos,
            lane_y,
            lane,
            hp,
            max_hp: hp,
            r: base.r * if boost > 1.0 { 1.15 } else { 1.0 },
            armor: base.armor,
            range: base.range,
            interval: base.interval,
            speed: base.speed,
            damage: (base.damage + 0.6 * n) * boost,
            gold: base.gold + (0.7 * n).floor(),
            xp: base.xp + 1.5 * n,
            attack_ready,
            roll,
            ..Unit::default()
        });
        self.creeps.push(id);
    }

    fn update_hero(&mut self, id: Id, dt: f64) {
        let time = self.time;
        self.h_mut(id).gold += dt * 1.6;
        if self.u(id).hp <= 0.0 {
            let h = self.h_mut(id);
            for ready in &mut h.cd {
                if *ready > time - dt {
                    *ready += dt;
                }
            }
            if h.recall_ready > time - dt {
                h.recall_ready += dt;
            }
            if h.bot.is_some() && time >= h.think {
                self.think(id);
            }
            if time >= self.h(id).respawn {
                self.respawn_hero(id);
            }
            return;
        }
        let h = self.h_mut(id);
        let len = h.buffs.len();
        h.buffs.retain(|buff| buff.until > time);
        if h.buffs.len() != len {
            h.stats_dirty = true;
        }
        if self.training.is_some() {
            self.refill_training(id);
        } else {
            self.refresh_if_changed(id);
            let home = self.home(self.u(id).team);
            let u = self.u_mut(id);
            let h = u.hero.as_mut().unwrap();
            let regen = stat(&h.stats, "regen")
                + if h.potion_until > time { 30.0 } else { 0.0 }
                + if time - h.last_threat >= 6.0 {
                    stat(&h.stats, "recover") * u.max_hp
                } else {
                    0.0
                };
            let fountain = if u.pos.dist(home) <= 400.0 { 0.15 } else { 0.0 };
            u.hp = u.max_hp.min(u.hp + dt * (regen + u.max_hp * fountain));
            h.mana = h
                .max_mana
                .min(h.mana + dt * (stat(&h.stats, "manaRegen") + h.max_mana * fountain));
        }
        if self.u(id).hp <= 0.0 {
            return;
        }
        if self.u(id).lift_until > time {
            self.u_mut(id).dash = None;
        }
        if let Some(dash) = self.u(id).dash {
            self.walk(id, dash.pos, dash.spell.speed, dt);
            if self.u(id).pos.dist(dash.pos) < 1e-6 {
                self.blast(id, dash.spell, self.u(id).pos, dash.damage);
                self.u_mut(id).dash = None;
            }
            return;
        }
        if self.u(id).stun_until > time {
            self.u_mut(id).windup = None;
            self.h_mut(id).channel = 0.0;
            return;
        }
        let h = self.h(id);
        if h.bot.is_some() && time >= h.think {
            self.think(id);
        }
        if self.u(id).dash.is_some() {
            return;
        }
        let channel = self.h(id).channel;
        if channel != 0.0 {
            if channel <= time {
                let cooldown = if self.no_cooldowns() { 0.0 } else { 45.0 };
                let h = self.h_mut(id);
                h.channel = 0.0;
                h.recall_ready = time + cooldown;
                self.blink(
                    id,
                    if self.training.is_some() {
                        training_start()
                    } else {
                        self.home(self.u(id).team)
                    },
                );
            }
            return;
        }
        if self.finish_attack(id) {
            return;
        }
        let order = self.h(id).order;
        if matches!(order, Order::Stop) {
            return;
        }
        let u = self.u(id);
        let speed = u.move_speed(stat(&self.h(id).stats, "speed"));
        if let Order::Move(pos) = order {
            self.walk(id, pos, speed, dt);
            if self.u(id).pos.dist(pos) < 2.0 {
                self.h_mut(id).order = Order::None;
            }
            return;
        }
        let auto =
            matches!(order, Order::Advance(_)) || (self.h(id).bot.is_none() && !u.veiled(time));
        let target = if let Order::Attack(target) = order {
            Some(target)
        } else if auto {
            self.nearest(
                id,
                u.attack_range()
                    + if matches!(order, Order::None) {
                        140.0
                    } else {
                        200.0
                    },
                |_| true,
            )
        } else {
            None
        };
        let target = target.filter(|&id| {
            self.units.get(&id).is_some_and(|b| {
                b.hp > 0.0
                    && !b.veiled(time)
                    && b.cyclone_until <= time
                    && !self.protected(id)
                    && (b.team != u.team || b.hp < b.max_hp * 0.5)
            })
        });
        if let Some(target) = target {
            if !self.attack(id, Some(target)) {
                self.walk(id, self.u(target).pos, speed, dt);
            }
        } else if let Order::Advance(pos) = order {
            self.walk(id, pos, speed, dt);
            if self.u(id).pos.dist(pos) < 2.0 {
                self.h_mut(id).order = Order::None;
            }
        } else if matches!(order, Order::Attack(_)) {
            self.h_mut(id).order = Order::None;
        }
    }

    fn update_creep(&mut self, id: Id, dt: f64) {
        let u = self.u(id);
        if u.sentry && self.time >= u.expires {
            self.u_mut(id).hp = 0.0;
            return;
        }
        if u.stun_until > self.time {
            self.u_mut(id).windup = None;
            return;
        }
        if self.finish_attack(id) {
            return;
        }
        let u = self.u(id);
        if u.sentry {
            self.attack(id, self.nearest(id, u.range, |b| b.role != Role::Building));
            return;
        }
        let mut target = u.target.filter(|&t| {
            self.units.get(&t).is_some_and(|b| {
                b.hp > 0.0
                    && !self.protected(t)
                    && !b.veiled(self.time)
                    && b.cyclone_until <= self.time
                    && u.pos.dist(b.pos) <= 720.0
            })
        });
        if target.is_none() || (u.forced_until <= self.time && self.time >= u.scan) {
            self.u_mut(id).forced_until = 0.0;
            target = self.nearest(id, 480.0, |_| true);
            self.u_mut(id).scan = self.time + 0.4;
        }
        self.u_mut(id).target = target;
        if !self.attack(id, target) {
            let u = self.u(id);
            let march = if self.team_match {
                self.lane_point(
                    u.team,
                    u.lane,
                    self.lane_progress(u.team, u.lane, u.pos) + 125.0,
                )
            } else {
                Point::new(
                    if u.team == 0 { 4680.0 } else { 520.0 },
                    u.pos.y + (u.lane_y - u.pos.y).clamp(-40.0, 40.0),
                )
            };
            self.walk(
                id,
                target.map_or(march, |target| self.u(target).pos),
                u.move_speed(u.speed),
                dt,
            );
        }
    }

    fn update_building(&mut self, id: Id, dt: f64) {
        let u = self.u(id);
        if u.kind == "core" {
            self.u_mut(id).hp = u.max_hp.min(u.hp + 3.0 * dt);
            return;
        }
        let danger = self.heroes.iter().copied().find(|&enemy| {
            let h = self.u(enemy);
            h.team != u.team
                && h.hp > 0.0
                && !h.veiled(self.time)
                && h.cyclone_until <= self.time
                && u.reach(h) <= u.range
                && self.time - self.h(enemy).recent_aggro <= 2.5
        });
        self.finish_attack(id);
        let u = self.u(id);
        let mut target = u.target;
        if danger.is_some() {
            target = danger;
        } else if !target
            .and_then(|target| self.units.get(&target))
            .is_some_and(|b| {
                b.hp > 0.0
                    && b.cyclone_until <= self.time
                    && !b.veiled(self.time)
                    && u.reach(b) <= u.range
            })
        {
            target = self
                .nearest(id, u.range, |b| b.role == Role::Creep)
                .or_else(|| self.nearest(id, u.range, |b| b.role == Role::Hero));
        }
        let u = self.u_mut(id);
        u.target = target;
        if u.windup.is_none() {
            self.attack(id, target);
        }
    }

    fn collide(&mut self) {
        self.collision_rows.clear();
        self.collision_ids.clear();
        for u in self.units.values().filter(|u| u.hp > 0.0) {
            let flags =
                u32::from(!(u.role == Role::Building || u.dash.is_some() || u.dummy || u.sentry))
                    | (u32::from(u.veiled(self.time)) << 1);
            self.collision_ids.push(u.id);
            self.collision_rows
                .extend([u.pos.x, u.pos.y, u.r, u.team as f64, f64::from(flags)]);
        }
        let height = self.height();
        lanebreak_physics::separate_units_in_map(&mut self.collision_rows, rules().width, height);
        for (&id, row) in self.collision_ids.iter().zip(
            self.collision_rows
                .chunks_exact(lanebreak_physics::UNIT_STRIDE),
        ) {
            self.units.get_mut(&id).unwrap().pos = Point::new(row[0], row[1]);
        }
    }

    fn update_projectile(&mut self, p: &mut Projectile, dt: f64) -> bool {
        match &mut p.shot {
            Shot::Attack { target } => {
                let Some(b) = self.units.get(target) else {
                    return false;
                };
                if b.hp <= 0.0 || b.cyclone_until > self.time || b.veiled(self.time) {
                    return false;
                }
                let d = p.pos.dist(b.pos);
                if d <= p.speed * dt + b.r / 2.0 {
                    self.attack_hit(p.from, *target, p.damage);
                    return false;
                }
                let delta = b.pos.delta(p.pos);
                p.pos.x += delta.x / d * p.speed * dt;
                p.pos.y += delta.y / d * p.speed * dt;
                true
            }
            Shot::Bolt {
                dir,
                left,
                spell,
                hit,
            } => {
                let length = left.min(p.speed * dt);
                let mut rows = Vec::new();
                let mut ids = Vec::new();
                for u in self.units.values().filter(|u| {
                    u.hp > 0.0
                        && u.team != p.team
                        && u.cyclone_until <= self.time
                        && u.role != Role::Building
                        && hit
                            .get(&u.id)
                            .is_none_or(|&ready| ready <= self.time + 1e-8)
                }) {
                    ids.push(u.id);
                    rows.extend([u.pos.x, u.pos.y, u.r, 0.0]);
                }
                lanebreak_physics::sweep_bolt(
                    &mut rows,
                    [p.pos.x, p.pos.y],
                    [dir.x, dir.y],
                    length,
                    spell.radius,
                );
                let mut hits: Vec<_> = ids
                    .into_iter()
                    .zip(rows.chunks_exact(lanebreak_physics::TARGET_STRIDE))
                    .filter(|(_, row)| row[3] >= 0.0)
                    .map(|(id, row)| (id, row[3]))
                    .collect();
                hits.sort_by(|a, b| a.1.total_cmp(&b.1));
                for (id, _) in hits {
                    let ready = if spell.repeat_hit > 0.0 {
                        self.time + spell.repeat_hit
                    } else {
                        f64::INFINITY
                    };
                    hit.insert(id, ready);
                    self.magic(id, p.from, spell, p.damage, Some(*dir));
                    if !spell.piercing {
                        return false;
                    }
                }
                *left -= length;
                p.pos = p.pos.projected(*dir, length);
                *left > 0.0
                    && (0.0..=rules().width).contains(&p.pos.x)
                    && (0.0..=self.height()).contains(&p.pos.y)
            }
        }
    }

    fn update_area(&mut self, a: &mut Area) -> bool {
        if a.spell.kind == Kind::Wall {
            let strike = self.time + 1e-8 >= a.time;
            if strike || self.time + 1e-8 >= a.scan_due {
                a.scan_due = self.time + 0.15;
                let targets: Vec<_> = self
                    .units
                    .values()
                    .filter(|u| {
                        u.team != a.team
                            && u.hp > 0.0
                            && u.cyclone_until <= self.time
                            && u.role != Role::Building
                            && a.spell.wall_covers(a.pos, a.dir, u.pos, u.r)
                    })
                    .map(|u| u.id)
                    .collect();
                for target in targets {
                    self.slow(target, "frostloom", a.spell.slow, a.spell.slow_time);
                    if strike {
                        self.hurt(target, a.damage, a.from, true, false);
                    }
                }
            }
        }
        if self.time + 1e-8 < a.time {
            return true;
        }
        if a.spell.kind == Kind::Meteor {
            self.projectiles.push(Projectile {
                id: a.id,
                pos: a.pos,
                from: a.from,
                team: a.team,
                speed: a.spell.speed,
                damage: a.damage,
                shot: Shot::Bolt {
                    dir: a.dir,
                    left: a.spell.roll,
                    spell: a.spell,
                    hit: BTreeMap::new(),
                },
            });
            self.effect(
                "burst",
                a.pos,
                json!({"team": a.team, "radius": a.spell.radius,
                "hero": self.u(a.from).source_name(), "spell": "meteor", "ability": a.spell.name}),
            );
            return false;
        }
        if a.spell.kind != Kind::Wall {
            self.blast(a.from, a.spell, a.pos, a.damage);
        }
        a.hits -= 1;
        if a.hits == 0 {
            return false;
        }
        a.time += a.spell.interval;
        a.duration = a.spell.interval;
        true
    }

    fn update_orb(&mut self) {
        if self.orb.is_none() && self.time >= self.next_orb {
            let y = if self.random() < 0.5 { 170.0 } else { 730.0 };
            let kinds = ["Haste", "Might", "Renewal", "Wealth"];
            let kind = kinds[(self.random() * kinds.len() as f64).floor() as usize];
            let pos = Point::new(
                2600.0,
                if self.team_match {
                    self.height() / 2.0 + y - 450.0
                } else {
                    y
                },
            );
            self.orb = Some(Orb { pos, kind });
            self.effect(
                "feed",
                pos,
                json!({"text": format!("{kind} orb appeared at the river")}),
            );
        }
        let Some(Orb { pos, kind }) = self.orb else {
            return;
        };
        let Some(id) = self
            .heroes
            .iter()
            .copied()
            .find(|&id| self.u(id).hp > 0.0 && self.u(id).pos.dist(pos) <= 50.0)
        else {
            return;
        };
        match kind {
            "Haste" => self.buff(id, kind, 12.0, Stats::from([("move".into(), 0.40)])),
            "Might" => self.buff(id, kind, 15.0, Stats::from([("multiplier".into(), 0.6)])),
            "Renewal" => self.buff(
                id,
                kind,
                8.0,
                Stats::from([
                    ("regen".into(), self.u(id).max_hp * 0.06),
                    ("manaRegen".into(), self.h(id).max_mana * 0.06),
                ]),
            ),
            "Wealth" => self.h_mut(id).gold += 120.0,
            _ => unreachable!(),
        }
        self.effect(
            "feed",
            pos,
            json!({"team": self.u(id).team, "text": format!("{} claimed {kind}", self.h(id).name)}),
        );
        self.orb = None;
        self.next_orb = self.time + 75.0;
    }

    fn update_fountains(&mut self) {
        for team in 0..=1 {
            if self.fountain_ready[team] > self.time {
                continue;
            }
            let home = self.home(team);
            let target = self
                .units
                .values()
                .filter(|u| {
                    u.team != team
                        && u.hp > 0.0
                        && u.role != Role::Building
                        && u.cyclone_until <= self.time
                        && home.dist(u.pos) <= 420.0
                })
                .min_by(|a, b| home.squared(a.pos).total_cmp(&home.squared(b.pos)));
            if let Some(target) = target {
                let (id, pos) = (target.id, target.pos);
                let core = self.building(team, "core").unwrap();
                self.fountain_ready[team] = self.time + 0.18;
                self.effect(
                    "fountain",
                    home,
                    json!({"team": team, "toX": pos.x, "toY": pos.y}),
                );
                self.hurt(id, 580.0, core, false, false);
            }
        }
    }

    pub fn step(&mut self, dt: f64, count: u32) {
        if !dt.is_finite() || dt <= 0.0 {
            return;
        }
        for _ in 0..count {
            if self.ended() {
                return;
            }
            self.tick(dt);
        }
    }

    fn tick(&mut self, dt: f64) {
        self.time += dt;
        let time = self.time;
        let expired = self
            .effects
            .iter()
            .take_while(|effect| time - effect["time"].as_f64().unwrap_or(time) >= 4.0)
            .count();
        self.effects.drain(..expired);
        if self.training.is_none() && time + 1e-8 >= self.next_wave {
            self.spawn();
            self.next_wave += 30.0;
        }
        // Resolve each burn immediately, since a death can affect the next unit's update.
        let ids: Vec<_> = self.units.keys().copied().collect();
        for id in ids {
            let u = self.u_mut(id);
            u.velocity = Point::default();
            u.slows.retain(|s| s.until > time);
            if u.hp > 0.0
                && let Some(mut burn) = u.burn
                && burn.next <= time
            {
                burn.next += burn.interval;
                burn.ticks -= 1;
                u.burn = (burn.ticks > 0).then_some(burn);
                self.hurt(id, burn.damage, burn.source, true, false);
            }
        }
        for seat in 0..self.heroes.len() {
            let id = self.heroes[seat];
            if !self.u(id).dummy {
                self.update_hero(id, dt);
            }
        }
        if self.training.is_none() {
            self.update_fountains();
        }
        for i in 0..self.buildings.len() {
            let id = self.buildings[i];
            if self.u(id).hp > 0.0 {
                self.update_building(id, dt);
            }
        }
        for i in 0..self.creeps.len() {
            let id = self.creeps[i];
            if self.u(id).hp > 0.0 {
                self.update_creep(id, dt);
            }
        }
        self.collide();
        let mut projectiles = std::mem::take(&mut self.projectiles);
        projectiles.retain_mut(|p| self.update_projectile(p, dt));
        self.projectiles = projectiles;
        let mut areas = std::mem::take(&mut self.areas);
        areas.retain_mut(|a| self.update_area(a));
        self.areas = areas;
        if self.training.is_none() {
            self.update_orb();
        }
        self.creeps.retain(|id| self.units[id].hp > 0.0);
        // In-flight shots retain their source's combat attribution after it dies.
        let from: BTreeSet<_> = self.projectiles.iter().map(|p| p.from).collect();
        self.units
            .retain(|id, u| u.role != Role::Creep || u.hp > 0.0 || from.contains(id));
    }
}
