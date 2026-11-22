use super::*;
use crate::rules::ItemTarget;

pub(super) enum Command {
    Move(Point),
    Advance(Point),
    Attack(Id),
    Stop,
    Cast {
        slot: usize,
        at: Point,
        target: Option<Id>,
        mode: Option<String>,
        recipe: Option<String>,
    },
    Item(usize, Point),
    PointItem {
        slot: usize,
        key: String,
        at: Point,
    },
    TargetItem {
        slot: usize,
        key: String,
        target: Id,
    },
    Buy(String),
    Sell(usize),
    TrainingHero(String),
    Potion,
    Recall,
}
impl Command {
    pub(super) fn cast(slot: usize, at: Point, target: Option<Id>) -> Self {
        Self::Cast {
            slot,
            at,
            target,
            mode: None,
            recipe: None,
        }
    }
    fn parse(input: &str) -> Option<Self> {
        let json: Value = serde_json::from_str(input).ok()?;
        let cmd = json.as_object()?;
        let op = cmd.get("o")?.as_str()?;
        let pos = || {
            let x = cmd.get("x")?.as_f64()?;
            let y = cmd.get("y")?.as_f64()?;
            (x.abs() <= 10_000.0 && y.abs() <= 10_000.0).then_some(Point::new(x, y))
        };
        let slot = || {
            let index = cmd.get("i")?.as_f64()?;
            ((0.0..6.0).contains(&index) && index.fract() == 0.0).then_some(index as usize)
        };
        let target = || {
            let id = cmd.get("id")?.as_f64()?;
            (id > 0.0 && id <= 9_007_199_254_740_991.0 && id.fract() == 0.0)
                .then_some(id.min(f64::from(Id::MAX)) as Id)
        };
        Some(match op {
            "move" => Self::Move(pos()?),
            "amove" => Self::Advance(pos()?),
            "attack" => Self::Attack(target()?),
            "stop" => Self::Stop,
            "potion" => Self::Potion,
            "recall" => Self::Recall,
            "sell" => Self::Sell(slot()?),
            "item" => {
                let (slot, at) = (slot()?, pos()?);
                if let Some(value) = cmd.get("item") {
                    let key = value.as_str()?;
                    if !matches!(rules().items.get(key)?.target, Some(ItemTarget::Point)) {
                        return None;
                    }
                    Self::PointItem {
                        slot,
                        key: key.into(),
                        at,
                    }
                } else {
                    Self::Item(slot, at)
                }
            }
            "targetItem" => {
                let key = cmd.get("item")?.as_str()?;
                if !matches!(
                    rules().items.get(key)?.target,
                    Some(ItemTarget::Ally | ItemTarget::Enemy | ItemTarget::SelfOrEnemy)
                ) {
                    return None;
                }
                Self::TargetItem {
                    slot: slot()?,
                    key: key.into(),
                    target: target()?,
                }
            }
            "trainingHero" => {
                let key = cmd.get("hero")?.as_str()?;
                if !rules().heroes.contains_key(key) {
                    return None;
                }
                Self::TrainingHero(key.into())
            }
            "buy" => {
                let id = cmd.get("id")?.as_str()?;
                if !rules().items.contains_key(id) {
                    return None;
                }
                Self::Buy(id.into())
            }
            "cast" => {
                let slot = slot()?;
                let mode = match cmd.get("castMode") {
                    None => None,
                    Some(m) => Some(m.as_str()?),
                };
                let (at, target) = match mode {
                    Some("unit") => (Point::default(), Some(target()?)),
                    None | Some("self" | "point") => (pos()?, target()),
                    _ => return None,
                };
                let recipe = match cmd.get("recipe") {
                    None => None,
                    Some(value) => {
                        let recipe = value.as_str()?;
                        if slot < 4
                            || recipe.len() != 3
                            || !recipe.bytes().all(|b| b"QWE".contains(&b))
                        {
                            return None;
                        }
                        Some(recipe.to_owned())
                    }
                };
                Self::Cast {
                    slot,
                    at,
                    target,
                    mode: mode.map(str::to_owned),
                    recipe,
                }
            }
            _ => return None,
        })
    }
}

fn cost_of(h: &Hero, key: &str, used: &mut [bool], root: bool) -> f64 {
    if !root
        && let Some((i, _)) = h
            .inventory
            .iter()
            .enumerate()
            .find(|(i, slot)| slot.id == key && !used[*i])
    {
        used[i] = true;
        return 0.0;
    }
    let item = &rules().items[key];
    item.cost
        + item
            .parts
            .iter()
            .map(|part| cost_of(h, part, used, false))
            .sum::<f64>()
}
fn sell_value(item: &Inventory, time: f64) -> f64 {
    if time - item.at <= 10.0 {
        item.spent
    } else {
        (rules().items[&item.id].total / 2.0).floor()
    }
}

impl Match {
    pub fn valid_order(input: &str) -> bool {
        !matches!(Command::parse(input), None | Some(Command::TrainingHero(_)))
    }
    pub fn order_json(&mut self, team: usize, input: &str) -> Option<String> {
        let Some(&id) = self.heroes.get(team) else {
            return Some("Invalid order".into());
        };
        let Some(cmd) = Command::parse(input) else {
            return Some("Invalid order".into());
        };
        self.command(id, cmd).err()
    }

    pub(super) fn can_shop(&self, id: Id) -> bool {
        let u = self.u(id);
        self.training.is_some() || u.hp <= 0.0 || u.pos.dist(self.home(u.team)) <= 430.0
    }

    fn recalculate_item_stats(&mut self, id: Id) {
        let prev_hp = self.u(id).max_hp;
        let prev_mana = self.h(id).max_mana;
        self.refresh(id);
        let u = self.u_mut(id);
        u.hp = u.max_hp.min(
            u.hp + if u.hp > 0.0 {
                (u.max_hp - prev_hp).max(0.0)
            } else {
                0.0
            },
        );
        let h = u.hero.as_mut().unwrap();
        h.mana = h.max_mana.min(h.mana + (h.max_mana - prev_mana).max(0.0));
    }

    pub(super) fn buy(&mut self, id: Id, key: &str) -> Result<(), String> {
        let h = self.h(id);
        let mut used = vec![false; h.inventory.len()];
        let cost = cost_of(h, key, &mut used, true);
        if !self.can_shop(id) {
            return Err("Return to your fountain to buy items".into());
        }
        if key == "potion" && h.pots >= 5 {
            return Err("Potion limit reached".into());
        }
        if key == "tome" {
            if h.level >= 15 {
                return Err("Maximum level reached".into());
            }
            if h.tome_ready > self.time {
                return Err(format!(
                    "Restocks in {}s",
                    (h.tome_ready - self.time).ceil()
                ));
            }
        } else if key != "potion" && used.iter().filter(|&&used| !used).count() >= 6 {
            return Err("Inventory full".into());
        }
        if h.gold + 1e-6 < cost {
            return Err(format!("Need {} more gold", (cost - h.gold).ceil()));
        }
        let t = self.time;
        let h = self.h_mut(id);
        h.gold -= cost;
        match key {
            "potion" => h.pots += 1,
            "tome" => {
                h.tome_ready = t + 150.0;
                self.gain_xp(id, 220.0);
            }
            _ => {
                let spent = cost
                    + h.inventory
                        .iter()
                        .zip(&used)
                        .filter(|(_, used)| **used)
                        .map(|(item, _)| sell_value(item, t))
                        .sum::<f64>();
                let mut used = used.into_iter();
                h.inventory.retain(|_| !used.next().unwrap());
                h.inventory.push(Inventory {
                    id: key.to_owned(),
                    spent,
                    at: t,
                });
                self.recalculate_item_stats(id);
            }
        }
        Ok(())
    }

    fn sell(&mut self, id: Id, slot: usize) -> Result<(), String> {
        if !self.can_shop(id) {
            return Err("Shop at your fountain or while dead".into());
        }
        let item = self.h(id).inventory.get(slot).ok_or("Empty slot")?;
        let value = sell_value(item, self.time);
        let h = self.h_mut(id);
        h.inventory.remove(slot);
        h.gold += value;
        self.recalculate_item_stats(id);
        Ok(())
    }

    fn use_item(
        &mut self,
        id: Id,
        i: usize,
        at: Point,
        expected: Option<&str>,
        selected: Option<Id>,
    ) -> Result<(), String> {
        let u = self.u(id);
        let h = self.h(id);
        let key = h
            .inventory
            .get(i)
            .map(|slot| slot.id.clone())
            .ok_or("No active item in this slot")?;
        let spec = &rules().items[&key];
        if spec.cd == 0.0 {
            return Err("No active item in this slot".into());
        }
        if u.stun_until > self.time || u.dash.is_some() {
            return Err("Unable to act".into());
        }
        if h.items_ready.get(&key).is_some_and(|&t| t > self.time) {
            return Err("Item cooling down".into());
        }
        if let Some(expected) = expected
            && expected != key
        {
            return Err("Item changed. Select the equipment again.".into());
        }
        let target = match &spec.target {
            Some(ItemTarget::Point) if selected.is_none() => id,
            Some(ItemTarget::Point) => return Err("Select a point on the ground".into()),
            Some(side) => selected
                .filter(|target| {
                    self.units.get(target).is_some_and(|b| {
                        let ally = u.team == b.team;
                        let allowed = match side {
                            ItemTarget::Ally => ally,
                            ItemTarget::Enemy => !ally,
                            ItemTarget::SelfOrEnemy => u.id == b.id || !ally,
                            ItemTarget::Point => false,
                        };
                        b.role == Role::Hero
                            && b.hp > 0.0
                            && allowed
                            && (ally || !b.veiled(self.time))
                            && b.cyclone_until <= self.time
                            && u.reach(b) <= spec.range
                    })
                })
                .ok_or(match side {
                    ItemTarget::Ally => "Select an allied hero in range",
                    ItemTarget::SelfOrEnemy => "Select yourself or an enemy hero in range",
                    _ => "Select an enemy hero in range",
                })?,
            None if selected.is_none() => id,
            None => return Err("This item does not target a hero".into()),
        };
        match key.as_str() {
            "rift" => {
                if self.time - h.last_threat < 2.5 {
                    return Err("Rift Stone is disabled in combat".into());
                }
                self.blink(id, u.pos.towards(at, spec.range, 0.0, true, self.height()));
                self.h_mut(id).channel = 0.0;
                self.u_mut(id).windup = None;
            }
            "striders" => {
                self.buff(id, "sprint", 4.0, Stats::from([("move".into(), 0.35)]));
                self.h_mut(id).channel = 0.0;
            }
            "locket" => {
                let u = self.u_mut(id);
                u.hp = u.max_hp.min(u.hp + 280.0);
                let h = u.hero.as_mut().unwrap();
                h.mana = h.max_mana.min(h.mana + 120.0);
            }
            "horn" => {
                let (team, pos) = (u.team, u.pos);
                let nearby = self.nearby_creeps(pos, team, 700.0);
                if nearby.is_empty() {
                    return Err("War Horn requires nearby allied creeps".into());
                }
                for creep in nearby {
                    self.u_mut(creep).horn_until = self.time + 8.0;
                }
                self.effect(
                    "burst",
                    pos,
                    json!({"team": team, "radius": 700, "hero": self.h(id).key,
                    "audience": self.u(id).veiled(self.time).then_some(team)}),
                );
            }
            "faultline" => {
                if h.impact_ready > self.time {
                    return Err("Impact stun is recovering".into());
                }
                self.u_mut(id).veil_until = 0.0;
                self.apply_impact(id, target, 1.1, &key);
            }
            "spellward" => {
                let until = self.time + 4.0;
                self.h_mut(target).spell_barrier = Some(SpellBarrier {
                    health: 260.0,
                    until,
                });
                self.item_flash(target, &key);
            }
            "wayfarer" => {
                let b = self.u(target);
                let end = b
                    .pos
                    .projected(Point::new(b.facing.cos(), b.facing.sin()), 440.0);
                let to = b.pos.towards(end, 440.0, 0.0, true, self.height());
                self.item_flash(target, &key);
                self.blink(target, to);
                self.u_mut(target).dash = None;
            }
            "wellsplitter" => {
                self.u_mut(id).veil_until = 0.0;
                self.slow(target, "wellsplitter", 0.5, 2.0);
                self.item_flash(target, &key);
            }
            "galeglass" => {
                let until = self.time + 2.5;
                self.u_mut(id).veil_until = 0.0;
                let u = self.u_mut(target);
                u.cyclone_until = until;
                u.lift_until = u.lift_until.max(until);
                u.stun_until = u.stun_until.max(until);
                u.windup = None;
                u.dash = None;
                self.h_mut(target).channel = 0.0;
                self.item_flash(target, &key);
            }
            _ => {}
        }
        if spec.target.is_some() {
            self.h_mut(id).channel = 0.0;
        }
        let ready = self.time + spec.cd;
        self.h_mut(id).items_ready.insert(key, ready);
        Ok(())
    }

    pub(super) fn command(&mut self, id: Id, cmd: Command) -> Result<(), String> {
        let team = self.u(id).team;
        if self.ended() || (self.training.is_some() && team != 0) {
            return Err("Invalid order".into());
        }
        match &cmd {
            Command::TrainingHero(key) => return self.switch_training_hero(id, key),
            Command::Buy(key) => {
                let before = self.h(id).gold;
                self.buy(id, key)?;
                let seat = self.heroes.iter().position(|&hero| hero == id);
                self.effect("purchase", self.u(id).pos, json!({"audienceSeat": seat, "item": key, "cost": js_round(before - self.h(id).gold)}));
                return Ok(());
            }
            Command::Sell(slot) => return self.sell(id, *slot),
            _ => {}
        }
        if self.u(id).hp <= 0.0 {
            return Err("You are respawning".into());
        }
        let time = self.time;
        match cmd {
            Command::Move(at) | Command::Advance(at) => {
                let p = self
                    .u(id)
                    .pos
                    .towards(at, f64::INFINITY, 0.0, true, self.height());
                let walking = matches!(cmd, Command::Move(_));
                let u = self.u_mut(id);
                let h = u.hero.as_mut().unwrap();
                h.order = if walking {
                    Order::Move(p)
                } else {
                    Order::Advance(p)
                };
                h.channel = 0.0;
                if walking {
                    u.windup = None;
                }
            }
            Command::Attack(target) => {
                let b = self.units.get(&target).ok_or("Invalid attack target")?;
                if b.hp <= 0.0
                    || b.veiled(time)
                    || b.cyclone_until > time
                    || self.protected(target)
                    || (b.team == team && b.role != Role::Creep)
                {
                    return Err("Invalid attack target".into());
                }
                let next = if b.team == team {
                    let transferred = self.transfer_creep_aggro(id, target);
                    let b = self.u(target);
                    if b.hp < b.max_hp / 2.0 {
                        Order::Attack(target)
                    } else if transferred {
                        Order::Stop
                    } else {
                        Order::Move(self.u(id).pos.towards(
                            b.pos,
                            f64::INFINITY,
                            0.0,
                            true,
                            self.height(),
                        ))
                    }
                } else {
                    if b.role == Role::Hero && !self.u(id).veiled(time) {
                        self.draw_creep_aggro(id);
                    }
                    Order::Attack(target)
                };
                let u = self.u_mut(id);
                let h = u.hero.as_mut().unwrap();
                h.order = next;
                h.channel = 0.0;
                if !matches!(next, Order::Attack(_))
                    || !u.windup.is_some_and(|w| w.target == target)
                {
                    u.windup = None;
                }
            }
            Command::Stop => {
                self.h_mut(id).order = Order::Stop;
                self.h_mut(id).channel = 0.0;
                self.u_mut(id).windup = None;
            }
            Command::Cast {
                slot,
                at,
                target,
                mode,
                recipe,
            } => {
                let h = self.h(id);
                let expected = h.spell(slot).map_or("self", Spell::cast_mode);
                if mode.as_deref().is_some_and(|mode| mode != expected)
                    || recipe
                        .as_ref()
                        .is_some_and(|r| h.prepared.get(slot - 4) != Some(r))
                {
                    return Err("Spell changed. Select the ability again.".into());
                }
                return self.cast(id, slot, at, target);
            }
            Command::Item(i, at) => return self.use_item(id, i, at, None, None),
            Command::PointItem { slot, key, at } => {
                return self.use_item(id, slot, at, Some(&key), None);
            }
            Command::TargetItem { slot, key, target } => {
                return self.use_item(id, slot, Point::default(), Some(&key), Some(target));
            }
            Command::Potion => {
                let h = self.h_mut(id);
                if h.pots == 0 {
                    return Err("No potions".into());
                }
                if h.potion_until > time {
                    return Err("Potion already active".into());
                }
                h.pots -= 1;
                h.potion_until = time + 10.0;
            }
            Command::Recall => {
                let u = self.u_mut(id);
                let h = u.hero.as_mut().unwrap();
                if h.channel != 0.0 {
                    return Err("Recall already active".into());
                }
                if u.stun_until > time || u.dash.is_some() {
                    return Err("Unable to act".into());
                }
                if h.recall_ready > time {
                    return Err("Recall cooling down".into());
                }
                h.channel = time + 3.0;
                h.order = Order::None;
                u.windup = None;
            }
            Command::Buy(_) | Command::Sell(_) | Command::TrainingHero(_) => unreachable!(),
        }
        Ok(())
    }

    fn switch_training_hero(&mut self, id: Id, key: &str) -> Result<(), String> {
        if self.training.is_none() {
            return Err("Hero switching is only available in training".into());
        }
        if self.h(id).key == key {
            return Ok(());
        }
        let player = self.u_mut(id);
        let previous = player.hero.as_mut().unwrap();
        let mut hero = Hero::new(key.into(), rules().heroes[key].name.clone(), None, 0.0);
        hero.level = previous.level;
        hero.gold = previous.gold;
        hero.inventory = std::mem::take(&mut previous.inventory);
        hero.order = Order::Stop;
        *player = Unit {
            id,
            role: Role::Hero,
            team: player.team,
            pos: player.pos,
            facing: player.facing,
            r: player.r,
            hero: Some(hero),
            ..Unit::default()
        };
        for sentry in self.creeps.drain(..) {
            self.units.remove(&sentry);
        }
        self.areas.clear();
        self.projectiles.clear();
        self.effects.clear();
        let dummy = self.u_mut(self.heroes[1]);
        dummy.stun_until = 0.0;
        dummy.disarmed_until = 0.0;
        dummy.lift_until = 0.0;
        dummy.cyclone_until = 0.0;
        dummy.slows.clear();
        dummy.stitch = None;
        dummy.resonance = None;
        dummy.burn = None;
        self.refill_training(id);
        Ok(())
    }

    fn cast(
        &mut self,
        id: Id,
        slot: usize,
        mut at: Point,
        target: Option<Id>,
    ) -> Result<(), String> {
        let u = self.u(id);
        let time = self.time;
        if u.stun_until > time || u.dash.is_some() {
            return Err("Unable to act".into());
        }
        let h = self.h(id);
        let spell = h.spell(slot).ok_or("Invalid ability")?;
        let level = h.unlock(slot);
        let free = self.training.is_some();
        if h.level < level {
            return Err(format!("Unlocks at level {level}"));
        }
        if !free && h.ready_at(slot) > time {
            return Err("Ability cooling down".into());
        }
        if spell.kind == Kind::Prepared {
            return Err("Prepare a spell with R first".into());
        }
        let recipe = if spell.kind == Kind::Invoke {
            let recipe = h.recipe().ok_or("Queue three marks with Q, W, or E")?;
            if h.prepared.first() == Some(&recipe) {
                return Err("That spell is already in D".into());
            }
            Some(recipe)
        } else {
            None
        };
        if !free && h.mana < spell.mana {
            return Err("Not enough mana".into());
        }
        if spell.kind == Kind::Unit {
            let target = target
                .filter(|&target| self.targetable_hero(id, target, spell))
                .ok_or("Select an enemy hero in range")?;
            at = self.u(target).pos;
        }
        if spell.kind == Kind::Mark {
            let marks = &mut self.h_mut(id).marks;
            if marks.len() == 3 {
                marks.remove(0);
            }
            marks.push(slot);
            return Ok(());
        }
        if !free {
            let h = self.h_mut(id);
            let ready = time + spell.cd * (1.0 - stat(&h.stats, "cdr"));
            h.mana -= spell.mana;
            if slot >= 4 {
                h.weave_ready.insert(h.prepared[slot - 4].clone(), ready);
            } else {
                h.cd[slot] = ready;
            }
        }
        if let Some(recipe) = recipe {
            let h = self.h_mut(id);
            h.prepared.retain(|r| r != &recipe);
            h.prepared.insert(0, recipe);
            h.prepared.truncate(2);
            h.marks.clear();
            return Ok(());
        }
        let ultimate = slot == 3 && self.h(id).kit().weaves.is_none();
        let damage = self.spell_damage(id, spell);
        if spell.heat_damage != 0.0 {
            self.h_mut(id).heat = 0;
        }
        let u = self.u_mut(id);
        let (origin, team, recast) = (u.pos, u.team, spell.kind == Kind::Veil && u.veiled(time));
        u.veil_until = 0.0;
        u.windup = None;
        u.hero.as_mut().unwrap().channel = 0.0;
        if spell.cast_mode() != "self" && at != origin {
            let delta = at.delta(origin);
            u.facing = delta.y.atan2(delta.x);
        }
        let dir = Point::new(u.facing.cos(), u.facing.sin());
        self.effect(
            "cast",
            origin,
            json!({"team": team, "caster": id, "hero": self.h(id).key, "spell": spell.kind.name(),
            "ability": spell.name,
            "ultimate": ultimate, "audience": recast.then_some(team)}),
        );
        match spell.kind {
            Kind::Bolt => {
                let pid = self.id();
                self.projectiles.push(Projectile {
                    id: pid,
                    pos: origin.projected(dir, 20.0),
                    from: id,
                    team,
                    speed: spell.speed,
                    damage,
                    shot: Shot::Bolt {
                        dir,
                        left: spell.range,
                        spell,
                        hit: BTreeMap::new(),
                    },
                });
            }
            Kind::Unit => self.magic(target.unwrap(), id, spell, damage, None),
            Kind::Meteor | Kind::Blast | Kind::Wall => {
                let area_id = self.id();
                self.areas.push(Area {
                    id: area_id,
                    pos: if spell.kind == Kind::Wall {
                        origin.projected(dir, spell.range)
                    } else {
                        self.cast_point(id, spell, at)
                    },
                    from: id,
                    team,
                    spell,
                    time: time + spell.delay,
                    duration: spell.delay,
                    ultimate,
                    hits: spell.hits.max(1),
                    damage,
                    dir,
                    scan_due: time,
                });
            }
            Kind::Sentry => {
                let level = f64::from(self.h(id).level - 1);
                let hp = spell.health + level * 15.0;
                let pos = self.cast_point(id, spell, at);
                self.effect(
                    "burst",
                    pos,
                    json!({"team": team, "hero": self.h(id).key, "ability": spell.name, "radius": 55}),
                );
                let sentry = self.insert(Unit {
                    kind: "ranged",
                    team,
                    pos,
                    r: 17.0,
                    hp,
                    max_hp: hp,
                    armor: 2.0,
                    range: 420.0,
                    interval: 1.05,
                    damage: spell.shot + level * spell.shot_growth,
                    sentry: true,
                    expires: time + spell.duration,
                    ..Unit::default()
                });
                self.creeps.push(sentry);
            }
            Kind::Nova => self.blast(id, spell, origin, damage),
            Kind::Dash => {
                self.u_mut(id).dash = Some(Dash {
                    pos: self.cast_point(id, spell, at),
                    spell,
                    damage,
                })
            }
            Kind::Blink => self.blink(id, self.cast_point(id, spell, at)),
            Kind::Buff => self.buff(id, &spell.name, spell.duration, spell.stats.clone()),
            Kind::Veil => {
                self.u_mut(id).veil_until = time + spell.duration;
                if matches!(self.h(id).order, Order::Attack(_) | Order::Advance(_)) {
                    self.h_mut(id).order = Order::None;
                }
            }
            Kind::Mark | Kind::Invoke | Kind::Prepared => unreachable!(),
        }
        Ok(())
    }
}
