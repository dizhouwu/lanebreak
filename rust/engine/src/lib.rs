mod ai;
mod combat;
mod orders;
mod rules;
mod snapshot;
mod tick;

use rules::{Kind, Kit, Spell, Stats, rules};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[cfg(test)]
mod tests;
#[cfg(target_arch = "wasm32")]
mod web;

pub type Id = u32;
const HEROES: [Id; 2] = [1, 2];

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
struct Point {
    x: f64,
    y: f64,
}
impl Point {
    const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
    fn delta(self, from: Self) -> Self {
        Self::new(self.x - from.x, self.y - from.y)
    }
    fn projected(self, direction: Self, length: f64) -> Self {
        Self::new(self.x + direction.x * length, self.y + direction.y * length)
    }
    fn squared(self, other: Self) -> f64 {
        let d = self.delta(other);
        d.x * d.x + d.y * d.y
    }
    fn dist(self, other: Self) -> f64 {
        let d = self.delta(other);
        let max = d.x.abs().max(d.y.abs());
        if max == 0.0 {
            return 0.0;
        }
        let x = d.x / max;
        let y = d.y / max;
        (x * x + y * y).sqrt() * max
    }
    fn towards(self, to: Self, limit: f64, min: f64, ground: bool) -> Self {
        let mut length = self.dist(to);
        if length == 0.0 {
            length = 1.0;
        }
        let result = self.projected(to.delta(self), length.max(min).min(limit) / length);
        let inset = if ground { 30.0 } else { 20.0 };
        Self::new(
            result.x.clamp(inset, rules().width - inset),
            if ground {
                result.y.clamp(70.0, 860.0)
            } else {
                result.y.clamp(20.0, rules().height - 20.0)
            },
        )
    }
}
fn home(team: usize) -> Point {
    Point::new(
        if team == 0 {
            110.0
        } else {
            rules().width - 110.0
        },
        450.0,
    )
}
fn training_start() -> Point {
    Point::new(rules().width / 2.0 - 420.0, 450.0)
}
fn stat(stats: &Stats, key: &str) -> f64 {
    stats.get(key).copied().unwrap_or(0.0)
}
fn physical(armor: f64) -> f64 {
    1.0 - 0.06 * armor / (1.0 + 0.06 * armor.abs())
}
fn xp_goal(level: u32) -> f64 {
    f64::from(200 + 100 * (level - 1))
}
fn js_round(n: f64) -> f64 {
    let floor = n.floor();
    if n - floor >= 0.5 { floor + 1.0 } else { floor }
}

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum Role {
    #[default]
    Creep,
    Hero,
    Building,
}
impl Role {
    fn name(self) -> &'static str {
        match self {
            Self::Hero => "hero",
            Self::Building => "building",
            Self::Creep => "creep",
        }
    }
}

#[derive(Clone, Copy, Default)]
enum Order {
    #[default]
    None,
    Stop,
    Move(Point),
    Advance(Point),
    Attack(Id),
}
#[derive(Clone, Copy)]
struct Windup {
    target: Id,
    time: f64,
}
#[derive(Clone, Copy)]
struct Dash {
    pos: Point,
    spell: &'static Spell,
    damage: f64,
}
#[derive(Clone, Copy)]
struct Stitch {
    source: Id,
    until: f64,
    ready: f64,
    hits: u32,
}
#[derive(Clone, Copy)]
struct Resonance {
    source: Id,
    until: f64,
}
#[derive(Clone, Copy)]
struct Burn {
    source: Id,
    damage: f64,
    ticks: u32,
    interval: f64,
    next: f64,
}
struct Slow {
    id: &'static str,
    value: f64,
    until: f64,
}
struct Buff {
    id: String,
    stats: Stats,
    until: f64,
}
#[derive(Clone, Serialize)]
struct Inventory {
    id: String,
    spent: f64,
    at: f64,
}

struct Hero {
    key: String,
    name: String,
    bot: Option<String>,
    think: f64,
    build_index: usize,
    sway: f64,
    retreat: bool,
    stats: Stats,
    stats_level: u32,
    stats_heat: u32,
    stats_dirty: bool,
    level: u32,
    xp: f64,
    gold: f64,
    mana: f64,
    max_mana: f64,
    inventory: Vec<Inventory>,
    items_ready: BTreeMap<String, f64>,
    tome_ready: f64,
    pots: u32,
    potion_until: f64,
    cd: [f64; 4],
    marks: Vec<usize>,
    prepared: Vec<String>,
    weave_ready: BTreeMap<String, f64>,
    heat: u32,
    buffs: Vec<Buff>,
    jump: u32,
    last_threat: f64,
    recent_aggro: f64,
    deaths: u32,
    last_hits: u32,
    denies: u32,
    respawn: f64,
    channel: f64,
    recall_ready: f64,
    order: Order,
}

impl Hero {
    fn new(key: String, name: String, bot: Option<String>, think: f64) -> Self {
        Self {
            key,
            name,
            bot,
            think,
            build_index: 0,
            sway: 0.0,
            retreat: false,
            stats: Stats::new(),
            stats_level: 0,
            stats_heat: 0,
            stats_dirty: true,
            level: 1,
            xp: 0.0,
            gold: 600.0,
            mana: 0.0,
            max_mana: 0.0,
            inventory: Vec::new(),
            items_ready: BTreeMap::new(),
            tome_ready: 0.0,
            pots: 0,
            potion_until: 0.0,
            cd: [0.0; 4],
            marks: Vec::new(),
            prepared: Vec::new(),
            weave_ready: BTreeMap::new(),
            heat: 0,
            buffs: Vec::new(),
            jump: 0,
            last_threat: f64::NEG_INFINITY,
            recent_aggro: f64::NEG_INFINITY,
            deaths: 0,
            last_hits: 0,
            denies: 0,
            respawn: 0.0,
            channel: 0.0,
            recall_ready: 0.0,
            order: Order::None,
        }
    }
    fn kit(&self) -> &'static Kit {
        &rules().heroes[&self.key]
    }
    fn spell(&self, slot: usize) -> Option<&'static Spell> {
        let kit = self.kit();
        if slot >= 4
            && let Some(weaves) = &kit.weaves
            && let Some(recipe) = self.prepared.get(slot - 4)
        {
            return weaves.get(recipe);
        }
        kit.abilities.get(slot)
    }
    fn unlock(&self, slot: usize) -> u32 {
        self.kit().unlocks.as_ref().unwrap_or(&rules().unlocks)[slot]
    }
    fn ready_at(&self, slot: usize) -> f64 {
        if slot < 4 {
            return self.cd[slot];
        }
        self.prepared
            .get(slot - 4)
            .and_then(|key| self.weave_ready.get(key))
            .copied()
            .unwrap_or(0.0)
    }
    fn recipe(&self) -> Option<String> {
        if self.marks.len() != 3 {
            return None;
        }
        let mut marks = [self.marks[0], self.marks[1], self.marks[2]];
        marks.sort_unstable();
        Some(marks.into_iter().map(|i| char::from(b"QWE"[i])).collect())
    }
}

#[derive(Default)]
struct Unit {
    id: Id,
    role: Role,
    kind: &'static str,
    team: usize,
    pos: Point,
    velocity: Point,
    r: f64,
    hp: f64,
    max_hp: f64,
    armor: f64,
    damage: f64,
    range: f64,
    interval: f64,
    speed: f64,
    facing: f64,
    attack_ready: f64,
    windup: Option<Windup>,
    dash: Option<Dash>,
    stun_until: f64,
    disarmed_until: f64,
    veil_until: f64,
    lift_until: f64,
    slows: Vec<Slow>,
    stitch: Option<Stitch>,
    resonance: Option<Resonance>,
    burn: Option<Burn>,
    horn_until: f64,
    hero: Option<Hero>,
    dummy: bool,
    sentry: bool,
    expires: f64,
    lane_y: f64,
    gold: f64,
    xp: f64,
    roll: [f64; 2],
    target: Option<Id>,
    scan: f64,
    forced_until: f64,
    aggro_ready: f64,
}
impl Unit {
    fn veiled(&self, time: f64) -> bool {
        self.veil_until > time
    }
    fn attack_range(&self) -> f64 {
        self.hero.as_ref().map_or(self.range, |h| h.kit().range)
    }
    fn attack_interval(&self) -> f64 {
        self.hero
            .as_ref()
            .map_or(self.interval, |h| h.kit().interval)
    }
    fn reach(&self, other: &Self) -> f64 {
        self.pos.dist(other.pos) - other.r
    }
    fn source_name(&self) -> &str {
        self.hero
            .as_ref()
            .map_or(self.role.name(), |h| h.key.as_str())
    }
    fn move_speed(&self, speed: f64) -> f64 {
        speed * (1.0 - self.slows.iter().map(|s| s.value).fold(0.0, f64::max))
    }
}

enum Shot {
    Attack {
        target: Id,
    },
    Bolt {
        dir: Point,
        left: f64,
        spell: &'static Spell,
        hit: BTreeSet<Id>,
    },
}
struct Projectile {
    id: Id,
    pos: Point,
    from: Id,
    team: usize,
    speed: f64,
    damage: f64,
    shot: Shot,
}
struct Area {
    id: Id,
    pos: Point,
    from: Id,
    team: usize,
    spell: &'static Spell,
    time: f64,
    duration: f64,
    ultimate: bool,
    hits: u32,
    damage: f64,
    dir: Point,
}
#[derive(Clone, Copy, Serialize)]
struct Orb {
    #[serde(flatten)]
    pos: Point,
    kind: &'static str,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Training {
    dummy: bool,
    damage: f64,
    hits: u32,
    last_hit: f64,
}
#[derive(Deserialize)]
struct TrainingOptions {
    dummy: Option<bool>,
}
#[derive(Default, Deserialize)]
#[serde(default)]
struct Options {
    heroes: Option<[String; 2]>,
    names: Vec<String>,
    bots: Option<[Option<String>; 2]>,
    seed: f64,
    training: Option<TrainingOptions>,
}
pub struct Match {
    time: f64,
    winner: Option<usize>,
    end_reason: Option<String>,
    next_id: Id,
    wave: u32,
    next_wave: f64,
    next_orb: f64,
    orb: Option<Orb>,
    units: BTreeMap<Id, Unit>,
    buildings: Vec<Id>,
    creeps: Vec<Id>,
    projectiles: Vec<Projectile>,
    areas: Vec<Area>,
    effects: Vec<Value>,
    next_effect: u64,
    rng: u32,
    kills: [u32; 2],
    training: Option<Training>,
    collision_rows: Vec<f64>,
    collision_ids: Vec<Id>,
}
impl Match {
    pub fn from_options(options: &str) -> Result<Self, serde_json::Error> {
        Ok(Self::new(serde_json::from_str(options)?))
    }
    fn new(options: Options) -> Self {
        let mut m = Self {
            time: 0.0,
            winner: None,
            end_reason: None,
            next_id: 1,
            wave: 0,
            next_wave: 2.0,
            next_orb: 60.0,
            orb: None,
            units: BTreeMap::new(),
            buildings: Vec::new(),
            creeps: Vec::new(),
            projectiles: Vec::new(),
            areas: Vec::new(),
            effects: Vec::new(),
            next_effect: 0,
            rng: options.seed.trunc().rem_euclid(4_294_967_296.0) as u32,
            kills: [0, 0],
            training: options.training.map(|t| Training {
                dummy: t.dummy.unwrap_or(true),
                ..Training::default()
            }),
            collision_rows: Vec::new(),
            collision_ids: Vec::new(),
        };
        let keys = options.heroes.unwrap_or(["brakk".into(), "orrin".into()]);
        let bots = options.bots.unwrap_or([None, Some("normal".into())]);
        for (team, (key, bot)) in keys.into_iter().zip(bots).enumerate() {
            let key = if rules().heroes.contains_key(&key) {
                key
            } else {
                "brakk".into()
            };
            let name = options
                .names
                .get(team)
                .filter(|n| !n.is_empty())
                .cloned()
                .unwrap_or_else(|| rules().heroes[&key].name.clone());
            let think = m.random() * 0.3;
            let id = m.insert(Unit {
                role: Role::Hero,
                team,
                pos: home(team),
                r: 26.0,
                hero: Some(Hero::new(key, name, bot, think)),
                ..Unit::default()
            });
            m.refresh(id);
            m.u_mut(id).hp = m.u(id).max_hp;
            m.h_mut(id).mana = m.h(id).max_mana;
        }
        if let Some(training) = &m.training {
            let enabled = training.dummy;
            m.u_mut(1).pos = training_start();
            let player = m.h_mut(1);
            player.level = 15;
            player.bot = None;
            player.order = Order::Stop;
            let dummy = m.u_mut(2);
            dummy.pos = Point::new(rules().width / 2.0 + 150.0, 450.0);
            dummy.r = 32.0;
            dummy.armor = 0.0;
            dummy.dummy = true;
            if !enabled {
                dummy.hp = 0.0;
            }
            let hero = m.h_mut(2);
            hero.name = "Training dummy".into();
            hero.bot = None;
            m.refill_training(1);
            return m;
        }
        for team in 0..=1 {
            for (kind, x, y, r, hp, armor, damage) in [
                ("outer", 1850.0, 330.0, 44.0, 1300.0, 12.0, 95.0),
                ("inner", 1150.0, 330.0, 44.0, 1600.0, 12.0, 125.0),
                ("core", 520.0, 450.0, 70.0, 3000.0, 14.0, 0.0),
            ] {
                let pos = Point::new(if team == 0 { x } else { rules().width - x }, y);
                let id = m.insert(Unit {
                    role: Role::Building,
                    team,
                    kind,
                    pos,
                    r,
                    hp,
                    max_hp: hp,
                    armor,
                    damage,
                    range: 560.0,
                    interval: 1.0,
                    ..Unit::default()
                });
                m.buildings.push(id);
            }
        }
        m
    }
    fn id(&mut self) -> Id {
        let id = self.next_id;
        self.next_id += 1;
        id
    }
    fn insert(&mut self, mut unit: Unit) -> Id {
        let id = self.id();
        unit.id = id;
        unit.facing = if unit.team == 0 {
            0.0
        } else {
            std::f64::consts::PI
        };
        self.units.insert(id, unit);
        id
    }
    fn u(&self, id: Id) -> &Unit {
        &self.units[&id]
    }
    fn u_mut(&mut self, id: Id) -> &mut Unit {
        self.units.get_mut(&id).expect("unknown unit")
    }
    fn h(&self, id: Id) -> &Hero {
        self.u(id).hero.as_ref().expect("expected hero")
    }
    fn h_mut(&mut self, id: Id) -> &mut Hero {
        self.u_mut(id).hero.as_mut().expect("expected hero")
    }
    fn building(&self, team: usize, kind: &str) -> Option<Id> {
        self.buildings.iter().copied().find(|&id| {
            let u = self.u(id);
            u.team == team && u.kind == kind
        })
    }
    fn protected(&self, id: Id) -> bool {
        let u = self.u(id);
        u.role == Role::Building
            && u.kind != "outer"
            && self
                .building(u.team, if u.kind == "inner" { "outer" } else { "inner" })
                .is_some_and(|tower| self.u(tower).hp > 0.0)
    }
    fn random(&mut self) -> f64 {
        self.rng = self.rng.wrapping_add(0x6D2B79F5);
        let seed = self.rng;
        let mut v = (seed ^ (seed >> 15)).wrapping_mul(1 | seed);
        v = v.wrapping_add((v ^ (v >> 7)).wrapping_mul(61 | v)) ^ v;
        f64::from(v ^ (v >> 14)) / 4_294_967_296.0
    }
    pub fn ended(&self) -> bool {
        self.end_reason.is_some()
    }
    pub fn finish(&mut self, winner: Option<usize>, reason: String) {
        if self.ended() {
            return;
        }
        self.winner = winner;
        self.end_reason = Some(reason);
    }
    pub fn set_bot(&mut self, team: usize, bot: Option<String>) {
        if let Some(&id) = HEROES.get(team) {
            let h = self.h_mut(id);
            h.bot = bot;
            if h.bot.is_none() {
                h.retreat = false;
            }
        }
    }
    fn effect(&mut self, kind: &str, pos: Point, props: Value) {
        self.next_effect += 1;
        let mut item = json!({"kind": kind, "x": pos.x, "y": pos.y, "time": self.time, "id": self.next_effect});
        if let Value::Object(props) = props {
            item.as_object_mut()
                .unwrap()
                .extend(props.into_iter().filter(|(_, v)| !v.is_null()));
        }
        self.effects.push(item);
    }
    pub fn notice(&mut self, team: usize, text: &str) {
        self.effect(
            "notice",
            Point::default(),
            json!({"audience": team, "text": text}),
        );
    }
    fn spell_damage(&self, id: Id, spell: &Spell) -> f64 {
        if spell.damage == 0.0 {
            return 0.0;
        }
        let h = self.h(id);
        js_round(
            (spell.damage
                + spell.growth * f64::from(h.level - 1)
                + spell.heat_damage * f64::from(h.heat))
                * stat(&h.stats, "power"),
        )
    }
    fn cast_point(&self, id: Id, spell: &Spell, mut at: Point) -> Point {
        let u = self.u(id);
        if spell.fixed || spell.kind == Kind::Bolt {
            let delta = at.delta(u.pos);
            let angle = if spell.fixed || at == u.pos {
                u.facing
            } else {
                delta.y.atan2(delta.x)
            };
            at = u
                .pos
                .projected(Point::new(angle.cos(), angle.sin()), spell.range);
            if spell.kind == Kind::Bolt {
                return at;
            }
        }
        u.pos.towards(
            at,
            spell.range,
            if spell.kind == Kind::Dash { 60.0 } else { 0.0 },
            spell.kind != Kind::Blast,
        )
    }
    fn targetable_hero(&self, from: Id, target: Id, spell: &Spell) -> bool {
        self.units.get(&target).is_some_and(|u| {
            let a = self.u(from);
            u.role == Role::Hero
                && u.team != a.team
                && u.hp > 0.0
                && !u.veiled(self.time)
                && a.reach(u) <= spell.range
        })
    }
}
