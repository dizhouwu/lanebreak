use super::*;

const MULTI_KILL_WINDOW: f64 = 12.0;

impl Match {
    pub(super) fn respawn_hero(&mut self, id: Id) {
        self.u_mut(id).pos = self.home(self.u(id).team);
        self.h_mut(id).jump += 1;
        self.refresh(id);
        self.u_mut(id).hp = self.u(id).max_hp;
        self.h_mut(id).mana = self.h(id).max_mana;
    }

    pub(super) fn refresh(&mut self, id: Id) {
        let time = self.time;
        let h = self.h(id);
        let kit = h.kit();
        let lv = f64::from(h.level - 1);
        let heat_attack = kit
            .heat
            .as_ref()
            .map_or(0.0, |p| f64::from(h.heat) * p.attack);
        let mut stats: Stats = [
            ("hp", kit.hp + lv * kit.hp_growth),
            ("mana", kit.mana + lv * kit.mana_growth),
            ("damage", kit.damage + lv * kit.damage_growth + heat_attack),
            ("armor", kit.armor + lv * kit.armor_growth),
            ("speed", kit.speed),
            ("regen", kit.regen + lv * 0.15),
            ("manaRegen", kit.mana_regen + lv * 0.08),
            ("haste", 1.0 + lv * kit.speed_growth),
            ("life", 0.0),
            ("power", 1.0),
            ("move", 1.0),
            ("multiplier", 1.0),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect();
        let mut strongest: BTreeMap<&str, f64> = BTreeMap::new();
        for item in &h.inventory {
            for (key, &value) in &rules().items[&item.id].stats {
                if matches!(
                    key.as_str(),
                    "speed"
                        | "cdr"
                        | "splash"
                        | "crit"
                        | "chill"
                        | "reflect"
                        | "recover"
                        | "bash"
                        | "manaBurn"
                ) {
                    let entry = strongest.entry(key).or_default();
                    *entry = entry.max(value);
                } else {
                    *stats.entry(key.clone()).or_default() += value;
                }
            }
        }
        for (key, value) in strongest {
            *stats.entry(key.to_owned()).or_default() += value;
        }
        for buff in h.buffs.iter().filter(|b| b.until > time) {
            for (key, value) in &buff.stats {
                *stats.entry(key.clone()).or_default() += value;
            }
        }
        let movement = stat(&stats, "move");
        *stats.get_mut("speed").unwrap() *= movement;
        let u = self.u_mut(id);
        u.max_hp = stats["hp"];
        u.armor = stats["armor"];
        let h = u.hero.as_mut().unwrap();
        h.max_mana = stats["mana"];
        if stat(&stats, "bash") == 0.0 {
            h.impact_hits = 0;
        }
        h.stats = stats;
        h.stats_level = h.level;
        h.stats_heat = h.heat;
        h.stats_dirty = false;
    }

    pub(super) fn refresh_if_changed(&mut self, id: Id) {
        let h = self.h(id);
        if h.stats_dirty || h.stats_level != h.level || h.stats_heat != h.heat {
            self.refresh(id);
        }
    }

    pub(super) fn refill_training(&mut self, id: Id) {
        if let Some(heat) = &self.h(id).kit().heat {
            self.h_mut(id).heat = heat.max;
        }
        self.refresh_if_changed(id);
        let u = self.u_mut(id);
        u.hp = u.max_hp;
        let h = u.hero.as_mut().unwrap();
        h.mana = h.max_mana;
        h.gold = h.gold.max(20_000.0);
    }

    pub(super) fn gain_xp(&mut self, id: Id, amount: f64) {
        if self.h(id).level >= 15 {
            return;
        }
        self.h_mut(id).xp += amount;
        while self.h(id).level < 15 && self.h(id).xp >= xp_goal(self.h(id).level) {
            let hp = self.u(id).max_hp;
            let mana = self.h(id).max_mana;
            let level = self.h(id).level;
            self.h_mut(id).xp -= xp_goal(level);
            self.h_mut(id).level += 1;
            self.refresh(id);
            let now = self.time;
            let u = self.u_mut(id);
            if u.hp > 0.0 {
                u.hp += u.max_hp - hp;
            }
            let h = u.hero.as_mut().unwrap();
            h.mana += h.max_mana - mana;
            let audience = u.veiled(now).then_some(u.team);
            let (pos, team) = (u.pos, u.team);
            self.effect(
                "level",
                pos,
                json!({"team": team, "audience": audience, "text": format!("LEVEL {}", level + 1)}),
            );
        }
        if self.h(id).level == 15 {
            self.h_mut(id).xp = 0.0;
        }
    }

    pub(super) fn buff(&mut self, id: Id, name: &str, duration: f64, stats: Stats) {
        let until = self.time + duration;
        let h = self.h_mut(id);
        h.buffs.retain(|buff| buff.id != name);
        h.buffs.push(Buff {
            id: name.to_owned(),
            until,
            stats,
        });
        h.stats_dirty = true;
    }

    pub(super) fn blink(&mut self, id: Id, at: Point) {
        let u = self.u(id);
        let audience = u.veiled(self.time).then_some(u.team);
        self.effect(
            "burst",
            u.pos,
            json!({"team": u.team, "radius": 65, "hero": u.source_name(), "audience": audience}),
        );
        let u = self.u_mut(id);
        u.pos = at;
        let h = u.hero.as_mut().unwrap();
        h.jump += 1;
        if matches!(h.order, Order::Move(_)) {
            h.order = Order::None;
        }
        let u = self.u(id);
        self.effect(
            "burst",
            at,
            json!({"team": u.team, "radius": 75, "hero": u.source_name(), "audience": audience}),
        );
    }

    pub(super) fn item_flash(&mut self, target: Id, item: &str) {
        let u = self.u(target);
        self.effect(
            "item",
            u.pos,
            json!({"item": item, "audience": u.veiled(self.time).then_some(u.team)}),
        );
    }

    pub(super) fn apply_impact(&mut self, source: Id, target: Id, duration: f64, item: &str) {
        let now = self.time;
        let recovery = if self.no_cooldowns() { 0.0 } else { 3.0 };
        let h = self.h_mut(source);
        h.impact_hits = 0;
        h.impact_ready = now + recovery;
        let b = self.u_mut(target);
        b.stun_until = b.stun_until.max(now + duration);
        b.windup = None;
        self.h_mut(target).channel = 0.0;
        self.item_flash(target, item);
    }

    fn hero_item_hit(&mut self, source: Id, target: Id) {
        let now = self.time;
        let h = self.h_mut(source);
        let burn = stat(&h.stats, "manaBurn");
        let bash = stat(&h.stats, "bash");
        let hits = h.impact_threshold();
        if bash > 0.0 {
            h.impact_hits = (h.impact_hits + 1).min(hits);
            if now >= h.impact_ready && h.impact_hits == hits {
                self.apply_impact(
                    source,
                    target,
                    if hits == 4 { bash } else { bash * 2.0 / 3.0 },
                    "gravemark",
                );
            }
        }
        if burn > 0.0 {
            let h = self.h_mut(target);
            h.mana = (h.mana
                - if hits == 4 {
                    burn
                } else {
                    (burn * 0.55).round()
                })
            .max(0.0);
        }
    }

    pub(super) fn hurt(&mut self, target: Id, raw: f64, source: Id, ability: bool, attack: bool) {
        let b = self.u(target);
        if b.hp <= 0.0
            || b.invulnerable(self.time)
            || raw <= 0.0
            || self.protected(target)
            || self.fortified(b)
        {
            return;
        }
        let a = self.u(source);
        let (target_role, source_role, team, pos) = (b.role, a.role, a.team, b.pos);
        let target_team = b.team;
        let (veiled, dummy) = (b.veiled(self.time), b.dummy);
        let mut amount = raw;
        if target_role == Role::Building {
            if ability {
                return;
            }
            amount *= if source_role == Role::Creep {
                if a.kind == "siege" { 1.5 } else { 0.5 }
            } else {
                0.75
            };
        }
        amount *= if ability {
            if target_role == Role::Hero { 0.75 } else { 1.0 }
        } else {
            physical(b.armor)
        };
        let audience = if veiled || (source_role != Role::Hero && a.spirit.is_none()) {
            target_team
        } else {
            team
        };
        if ability && target_role == Role::Hero && source_role == Role::Hero && team != target_team
        {
            let time = self.time;
            if let Some(barrier) = self.h_mut(target).spell_barrier.as_mut()
                && barrier.until > time
                && barrier.health > 0.0
            {
                let blocked = amount.min(barrier.health);
                barrier.health -= blocked;
                amount -= blocked;
                self.item_flash(target, "spellward");
            }
        }
        if target_role == Role::Hero && team != target_team && source_role != Role::Creep {
            let t = self.time;
            let h = self.h_mut(target);
            h.last_threat = t;
            h.potion_until = 0.0;
            if source_role == Role::Hero {
                self.h_mut(source).recent_aggro = t;
            }
        }
        if dummy {
            let train = self.training.as_mut().unwrap();
            train.damage += amount;
            train.last_hit = amount;
            train.hits += 1;
        } else {
            self.u_mut(target).hp -= amount;
        }
        if amount > 0.0 && (target_role == Role::Hero || source_role == Role::Hero) {
            self.effect(
                "hit",
                pos,
                json!({"team": team, "audience": audience, "text": js_round(amount).to_string()}),
            );
        }
        let t = self.time;
        if self.u(target).hp > 0.0
            && let Some(mut stitch) = self.u(target).stitch
            && stitch.source == source
            && stitch.until > t
            && stitch.ready <= t
        {
            let b = self.u_mut(target);
            b.stun_until = b.stun_until.max(t + 0.22);
            stitch.ready = t + 0.65;
            stitch.hits -= 1;
            b.stitch = (stitch.hits > 0).then_some(stitch);
            self.effect(
                "burst",
                pos,
                json!({"team": team, "radius": 42, "hero": self.u(source).source_name(), "ability": "Pin Stitch",
                "audience": veiled.then_some(target_team)}),
            );
        }
        let deny = target_role == Role::Creep && source_role == Role::Hero && team == target_team;
        if attack && source_role == Role::Hero && target_role != Role::Building {
            let h = self.h(source);
            let (life, chill, splash) = (
                stat(&h.stats, "life"),
                stat(&h.stats, "chill"),
                stat(&h.stats, "splash"),
            );
            let cleave = splash * if h.kit().range > 150.0 { 0.5 } else { 1.0 };
            if self.u(source).hp > 0.0 && life != 0.0 {
                let a = self.u_mut(source);
                a.hp = a.max_hp.min(a.hp + amount * life);
            }
            if !deny {
                if target_role == Role::Hero && target_team != team && self.u(target).hp > 0.0 {
                    self.hero_item_hit(source, target);
                }
                if chill > 0.0 {
                    self.slow(target, "frost", chill, 1.5);
                }
                if splash > 0.0 {
                    let nearby: Vec<_> = self
                        .units
                        .values()
                        .filter(|u| {
                            u.id != target
                                && u.team != team
                                && u.role != Role::Building
                                && u.pos.dist(pos) < 170.0
                        })
                        .map(|u| u.id)
                        .collect();
                    for id in nearby {
                        self.hurt(id, raw * cleave, source, false, false);
                    }
                }
                let reflect = self
                    .u(target)
                    .hero
                    .as_ref()
                    .map_or(0.0, |h| stat(&h.stats, "reflect"));
                if reflect > 0.0 {
                    self.hurt(source, raw * reflect, target, false, false);
                }
            }
        }
        if self.u(target).hp <= 0.0 {
            self.kill(target, source, deny);
        }
    }

    pub(super) fn kill(&mut self, id: Id, source: Id, deny: bool) {
        self.u_mut(id).hp = 0.0;
        let u = self.u(id);
        let (team, pos) = (u.team, u.pos);
        let enemy_team = 1 - team;
        let credit = self.u(source).spirit.map_or(source, |spirit| spirit.owner);
        let direct_killer = (self.u(credit).role == Role::Hero
            && self.u(credit).team == enemy_team)
            .then_some(credit);
        let killer = direct_killer.or_else(|| (!self.team_match).then(|| self.heroes[enemy_team]));
        match u.role {
            Role::Creep => {
                if u.spirit.is_some() {
                    return;
                }
                let (gold, xp) = (u.gold, u.xp);
                if killer == Some(credit) && !deny {
                    let hero = credit;
                    let alive = self.u(hero).hp > 0.0;
                    let h = self.h_mut(hero);
                    h.gold += gold;
                    h.last_hits += 1;
                    if alive && let Some(heat) = &h.kit().heat {
                        h.heat = (h.heat + 1).min(heat.max);
                    }
                    self.effect(
                        "gold",
                        pos,
                        json!({"audience": 1 - team, "text": format!("+{gold}")}),
                    );
                }
                if deny {
                    self.h_mut(source).denies += 1;
                    self.effect(
                        "gold",
                        pos,
                        json!({"audience": self.u(source).team, "text": "Denied"}),
                    );
                }
                let nearby: Vec<_> = self
                    .heroes
                    .iter()
                    .copied()
                    .filter(|&hero| {
                        let u = self.u(hero);
                        u.team == enemy_team && u.hp > 0.0 && u.pos.dist(pos) <= 1200.0
                    })
                    .collect();
                let share = xp * if deny { 0.4 } else { 1.0 } / nearby.len().max(1) as f64;
                for hero in nearby {
                    self.gain_xp(hero, share);
                }
            }
            Role::Hero => {
                let t = self.time;
                let u = self.u_mut(id);
                u.stitch = None;
                u.burn = None;
                u.resonance = None;
                u.disarmed_until = 0.0;
                u.veil_until = 0.0;
                u.lift_until = 0.0;
                u.cyclone_until = 0.0;
                u.root_until = 0.0;
                u.sweep_origin = None;
                u.windup = None;
                u.dash = None;
                u.hook_pull = None;
                u.slows.clear();
                u.stun_until = 0.0;
                let h = u.hero.as_mut().unwrap();
                h.deaths += 1;
                h.kill_streak = 0;
                h.multi_kill = None;
                h.charge_until = 0.0;
                h.finisher_chain = None;
                h.brands.fill(None);
                h.heat /= 2;
                h.respawn = t + 5.0 + 2.2 * f64::from(h.level);
                h.order = Order::None;
                h.channel = 0.0;
                h.cast_channel = None;
                h.potion_until = 0.0;
                h.buffs.clear();
                h.spell_barrier = None;
                h.impact_hits = 0;
                let lv = h.level;
                self.effect("fall", pos, json!({"unit": "hero"}));
                let gold = 180 + 12 * lv;
                if let Some(hero) = killer {
                    self.h_mut(hero).gold += f64::from(gold);
                    self.gain_xp(hero, f64::from(100 + 35 * lv));
                }
                let (attacker, streak, multi_kill) = if let Some(hero) = direct_killer {
                    let alive = self.u(hero).hp > 0.0;
                    let h = self.h_mut(hero);
                    if alive {
                        h.kill_streak = h.kill_streak.saturating_add(1);
                        let count = h
                            .multi_kill
                            .filter(|&(last, _)| t - last <= MULTI_KILL_WINDOW)
                            .map_or(1, |(_, count)| count.saturating_add(1));
                        h.multi_kill = Some((t, count));
                    }
                    (
                        h.name.clone(),
                        h.kill_streak,
                        h.multi_kill.map_or(0, |(_, count)| count),
                    )
                } else {
                    let source = self.u(source);
                    let source_type = match source.role {
                        Role::Building if source.kind == "core" => "Fountain",
                        Role::Building => "Tower",
                        _ => "Creep",
                    };
                    (
                        format!("{} {source_type}", rules().teams[source.team]),
                        0,
                        0,
                    )
                };
                let announcement = match streak {
                    1 if self.kills == [0, 0] => Some("First Blood"),
                    3 => Some("Killing Spree"),
                    4 => Some("Dominating"),
                    5 => Some("Mega Kill"),
                    6 => Some("Unstoppable"),
                    7 => Some("Wicked Sick"),
                    8 => Some("Monster Kill"),
                    9 => Some("Godlike"),
                    10.. => Some("Holy Shit"),
                    _ => None,
                };
                let multi_kill_announcement = match multi_kill {
                    2 => Some("Double Kill"),
                    3 => Some("Triple Kill"),
                    4 => Some("Ultra Kill"),
                    5.. => Some("Rampage"),
                    _ => None,
                };
                let victim = self.h(id).name.clone();
                let mut text = format!("{attacker} killed {victim}");
                if direct_killer.is_some() {
                    text.push_str(&format!(" (+{gold} gold)"));
                }
                self.kills[enemy_team] += 1;
                self.effect("kill", pos, json!({"team": enemy_team, "text": text,
                    "attacker": attacker, "victim": victim, "streak": streak, "announcement": announcement,
                    "multiKill": multi_kill, "multiKillAnnouncement": multi_kill_announcement}));
            }
            Role::Building => {
                if u.kind == "core" {
                    self.finish(Some(1 - team), "core".into());
                } else {
                    let text = format!("{} {} tower destroyed", rules().teams[team], u.kind);
                    if let Some(hero) = killer {
                        self.h_mut(hero).gold += 180.0;
                    }
                    self.effect("fall", pos, json!({"unit": "tower"}));
                    self.effect("feed", pos, json!({"team": team, "text": text}));
                }
            }
        }
    }

    pub(super) fn damage_at_launch(&mut self, id: Id) -> f64 {
        let u = self.u(id);
        let (damage, crit) = if let Some(h) = &u.hero {
            (h.attack_damage(), stat(&h.stats, "crit"))
        } else {
            (
                u.damage * if u.horn_until > self.time { 1.4 } else { 1.0 },
                0.0,
            )
        };
        if crit > 0.0 && self.random() < crit {
            damage * 1.8
        } else {
            damage
        }
    }

    pub(super) fn attack_hit(&mut self, from: Id, target: Id, damage: f64) {
        let (a, b) = (self.u(from), self.u(target));
        if a.team == b.team && (b.role != Role::Creep || b.hp >= b.max_hp / 2.0) {
            return;
        }
        let charge_at = (a.hp > 0.0
            && a.team != b.team
            && b.role != Role::Building
            && b.hp > 0.0
            && !b.invulnerable(self.time)
            && a.hero.as_ref().is_some_and(|h| h.charge_until > self.time))
        .then_some(b.pos);
        if charge_at.is_some() {
            self.h_mut(from).charge_until = 0.0;
        }
        let damage = self.finisher_damage(from, target).unwrap_or(damage);
        self.hurt(target, damage, from, false, true);
        if let Some(pos) = charge_at {
            let passive = &self.h(from).kit().abilities[2];
            self.blast(from, passive, pos, self.spell_damage(from, passive));
        }
    }

    fn finisher_damage(&mut self, from: Id, target: Id) -> Option<f64> {
        let a = self.u(from);
        let b = self.u(target);
        if a.hp <= 0.0
            || a.team == b.team
            || b.role != Role::Hero
            || b.hp <= 0.0
            || b.invulnerable(self.time)
            || b.veiled(self.time)
            || self.protected(target)
        {
            return None;
        }
        let spell = a.hero.as_ref()?.finisher()?;
        let (time, pos, team, facing) = (self.time, b.pos, a.team, a.facing);
        let h = self.h_mut(from);
        let hits = h
            .finisher_chain
            .as_ref()
            .filter(|chain| chain.target == target && chain.until > time)
            .map_or(1, |chain| chain.hits + 1);
        h.finisher_chain = (hits < spell.crit_hits).then_some(FinisherChain {
            target,
            hits,
            until: time + spell.duration,
        });
        if hits < spell.crit_hits {
            return None;
        }
        let damage = h.attack_damage() * spell.crit_multiplier;
        self.effect("finisher", pos, json!({"team":team, "facing":facing}));
        Some(damage)
    }

    fn attack_speed(&self, id: Id) -> f64 {
        let u = self.u(id);
        if let Some(h) = &u.hero {
            stat(&h.stats, "haste")
        } else if u.horn_until > self.time {
            1.3
        } else {
            1.0
        }
    }

    pub(super) fn attack(&mut self, from: Id, target: Option<Id>) -> bool {
        let Some(target) = target else {
            return false;
        };
        let (a, b) = (self.u(from), self.u(target));
        let time = self.time;
        if b.hp <= 0.0
            || b.invulnerable(time)
            || b.veiled(time)
            || a.reach(b) > a.attack_range()
            || self.protected(target)
        {
            return false;
        }
        if a.attack_ready > time || a.disarmed_until > time {
            return true;
        }
        let a_hero = a.role == Role::Hero;
        let b_hero = b.role == Role::Hero;
        let windup = match a.role {
            Role::Hero => 0.28,
            Role::Building => 0.2,
            Role::Creep => 0.35,
        };
        let delta = b.pos.delta(a.pos);
        let ready = time + windup / self.attack_speed(from);
        if a_hero && b_hero && a.veiled(time) {
            self.draw_creep_aggro(from);
        }
        let a = self.u_mut(from);
        if a_hero {
            a.veil_until = 0.0;
        }
        a.windup = Some(Windup {
            target,
            time: ready,
        });
        a.facing = delta.y.atan2(delta.x);
        if a_hero && b_hero {
            self.h_mut(from).recent_aggro = time;
        }
        true
    }

    pub(super) fn focus_creep(&mut self, creep: Id, target: Id) {
        let until = self.time + 2.3;
        let u = self.u_mut(creep);
        u.target = Some(target);
        u.forced_until = until;
        if u.windup.is_some_and(|w| w.target != target) {
            u.windup = None;
        }
    }

    pub(super) fn draw_creep_aggro(&mut self, hero: Id) {
        let a = self.u(hero);
        for id in self.nearby_creeps(a.pos, 1 - a.team, 500.0) {
            if self.u(id).aggro_ready > self.time {
                continue;
            }
            self.focus_creep(id, hero);
            self.u_mut(id).aggro_ready = self.time + 3.0;
        }
    }

    pub(super) fn transfer_creep_aggro(&mut self, hero: Id, ally: Id) -> bool {
        let team = self.u(hero).team;
        let mut transferred = false;
        for id in self.nearby_creeps(self.u(ally).pos, 1 - team, 500.0) {
            let u = self.u(id);
            if u.target != Some(hero) && !u.windup.is_some_and(|w| w.target == hero) {
                continue;
            }
            self.focus_creep(id, ally);
            transferred = true;
        }
        if transferred && self.h(hero).bot.is_none() {
            self.notice(team, "Creep aggro transferred");
        }
        transferred
    }

    pub(super) fn finish_attack(&mut self, from: Id) -> bool {
        let a = self.u(from);
        let Some(shot) = a.windup else {
            return false;
        };
        if !self.units.get(&shot.target).is_some_and(|b| {
            b.hp > 0.0
                && !b.veiled(self.time)
                && !b.invulnerable(self.time)
                && a.reach(b) <= a.attack_range() + 140.0
                && !self.protected(shot.target)
        }) {
            self.u_mut(from).windup = None;
            return false;
        }
        if self.time < shot.time {
            return true;
        }
        let (range, role) = (a.attack_range(), a.role);
        let ready = self.time + a.attack_interval() / self.attack_speed(from);
        let a = self.u_mut(from);
        a.windup = None;
        a.attack_ready = ready;
        let damage = self.damage_at_launch(from);
        if range <= 150.0 {
            self.attack_hit(from, shot.target, damage);
        } else {
            let speed = match role {
                Role::Hero => 1100.0,
                Role::Building => 1000.0,
                Role::Creep => 900.0,
            };
            self.launch_attack(from, shot.target, damage, speed);
            let tower = self.u(from);
            if self.fortified(tower) {
                let primary_creep = self.u(shot.target).role == Role::Creep;
                let extra_targets: Vec<_> = self
                    .creeps
                    .iter()
                    .copied()
                    .filter(|&id| {
                        let creep = self.u(id);
                        id != shot.target
                            && creep.team != tower.team
                            && creep.hp > 0.0
                            && !creep.veiled(self.time)
                            && !creep.invulnerable(self.time)
                            && tower.reach(creep) <= range
                    })
                    .take(FORTIFY_CREEP_TARGETS - usize::from(primary_creep))
                    .collect();
                for target in extra_targets {
                    self.launch_attack(from, target, damage, speed);
                }
            }
        }
        false
    }

    fn launch_attack(&mut self, from: Id, target: Id, damage: f64, speed: f64) {
        let id = self.id();
        let a = self.u(from);
        self.projectiles.push(Projectile {
            id,
            pos: a.pos,
            from,
            team: a.team,
            damage,
            speed,
            shot: Shot::Attack { target },
        });
    }

    pub(super) fn slow(&mut self, target: Id, id: &'static str, value: f64, duration: f64) {
        let until = self.time + duration;
        let u = self.u_mut(target);
        u.slows.retain(|s| s.id != id);
        u.slows.push(Slow { id, value, until });
    }

    pub(super) fn magic(
        &mut self,
        target: Id,
        from: Id,
        spell: &Spell,
        mut damage: f64,
        dir: Option<Point>,
    ) {
        let b = self.u(target);
        let (team, pos, role, radius) = (b.team, b.pos, b.role, b.r);
        let a_team = self.u(from).team;
        let origin = self.u(from).pos;
        if team == a_team || b.hp <= 0.0 || b.invulnerable(self.time) || role == Role::Building {
            return;
        }
        let time = self.time;
        let hidden = b.veiled(time);
        if spell.slow > 0.0 {
            self.slow(target, "slow", spell.slow, spell.slow_time);
        }
        let disable = if spell.lift > 0.0 {
            spell.lift
        } else {
            spell.stun
        };
        let height = self.height();
        let b = self.u_mut(target);
        if disable > 0.0 {
            b.stun_until = b.stun_until.max(time + disable);
        }
        if spell.lift > 0.0 {
            b.lift_until = b.lift_until.max(time + spell.lift);
        }
        if role == Role::Hero {
            if spell.accent > 0.0
                && b.resonance
                    .is_some_and(|m| m.source == from && m.until > time)
            {
                b.resonance = None;
                damage = js_round(damage * (1.0 + spell.accent));
                b.stun_until = b.stun_until.max(time + spell.accent_stun);
                self.effect(
                    "burst",
                    pos,
                    json!({"team": a_team, "radius": 70, "hero": self.u(from).source_name(),
                    "ability": spell.name, "accent": true,
                    "audience": hidden.then_some(team)}),
                );
            }
            let b = self.u_mut(target);
            if spell.drain > 0.0 {
                let h = b.hero.as_mut().unwrap();
                h.mana = (h.mana - spell.drain).max(0.0);
            }
            if spell.disarm > 0.0 {
                b.disarmed_until = b.disarmed_until.max(time + spell.disarm);
                b.windup = None;
            }
        }
        if role == Role::Hero && matches!(spell.kind, Kind::Bolt | Kind::Unit) {
            self.effect(
                "impact",
                pos,
                json!({"team": a_team, "radius": radius + 13.0, "hero": self.u(from).source_name(),
                "ability": spell.name, "audience": hidden.then_some(team)}),
            );
        }
        self.hurt(target, damage, from, true, false);
        let b = self.u_mut(target);
        if b.hp <= 0.0 {
            return;
        }
        if role == Role::Hero {
            if spell.resonance > 0.0 {
                b.resonance = Some(Resonance {
                    source: from,
                    until: time + spell.resonance,
                });
            }
            if spell.stitch {
                b.stitch = Some(Stitch {
                    source: from,
                    until: time + 4.0,
                    ready: time + 0.25,
                    hits: 3,
                });
            }
        }
        if spell.burn_ticks > 0 {
            let next = b
                .burn
                .filter(|burn| burn.source == from)
                .map_or(time + spell.burn_interval, |burn| burn.next);
            b.burn = Some(Burn {
                source: from,
                damage: damage * spell.burn_scale,
                ticks: spell.burn_ticks,
                interval: spell.burn_interval,
                next,
            });
        }
        let displacement = if spell.pull > 0.0 {
            let distance = (b.pos.dist(origin) - 65.0).clamp(0.0, spell.pull);
            Some(b.pos.towards(origin, distance, 0.0, true, height))
        } else {
            dir.filter(|_| spell.push > 0.0).map(|dir| {
                b.pos.towards(
                    b.pos.projected(dir, spell.push),
                    f64::INFINITY,
                    0.0,
                    true,
                    height,
                )
            })
        };
        if let Some(destination) = displacement
            && destination != b.pos
        {
            b.pos = destination;
            if let Some(h) = &mut b.hero {
                h.jump += 1;
            }
        }
    }

    pub(super) fn blast(&mut self, from: Id, spell: &Spell, pos: Point, damage: f64) {
        let a = self.u(from);
        let team = a.team;
        self.effect(
            "burst",
            pos,
            json!({"team": team, "radius": spell.radius, "hero": a.source_name(), "ability": spell.name}),
        );
        let targets: Vec<_> = self
            .units
            .values()
            .filter(|u| {
                let reach = spell.radius + u.r / 2.0;
                u.team != team
                    && u.hp > 0.0
                    && u.role != Role::Building
                    && u.pos.squared(pos) <= reach * reach
            })
            .map(|u| u.id)
            .collect();
        for id in targets {
            self.magic(id, from, spell, damage, None);
        }
    }
}
