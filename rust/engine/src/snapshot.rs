use super::*;
use serde::ser::SerializeSeq;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Basic {
    id: Id,
    #[serde(rename = "type")]
    role: &'static str,
    team: usize,
    #[serde(flatten)]
    pos: Point,
    r: f64,
    hp: f64,
    max_hp: f64,
    attack: bool,
    stunned: bool,
}
impl Basic {
    fn new(u: &Unit, time: f64) -> Self {
        Self {
            id: u.id,
            role: u.role.name(),
            team: u.team,
            pos: u.pos,
            r: u.r,
            hp: u.hp,
            max_hp: u.max_hp,
            attack: u.windup.is_some(),
            stunned: u.stun_until > time,
        }
    }
}

#[derive(Serialize)]
struct Building {
    #[serde(flatten)]
    unit: Basic,
    kind: &'static str,
    protected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<Id>,
}

#[derive(Serialize)]
struct Identity<'a> {
    id: Id,
    #[serde(rename = "type")]
    role: &'static str,
    team: usize,
    hero: &'a str,
    name: &'a str,
    level: u32,
    computer: bool,
    loadout: Vec<&'a str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicHero<'a> {
    hero: &'a str,
    name: &'a str,
    level: u32,
    computer: bool,
    channel: f64,
    mana: f64,
    max_mana: f64,
    deaths: u32,
    last_hits: u32,
    denies: u32,
    jump: u32,
    facing: f64,
    buffs: Vec<&'a str>,
    potion_active: bool,
    loadout: Vec<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    spell_barrier: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cyclone_until: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    respawn: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    heat: Option<u32>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    dummy: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    veiled: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    lifted: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    burning: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stitched: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    resonating: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    disarmed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PrivateHero<'a> {
    gold: f64,
    xp: f64,
    cd: &'a [f64; 4],
    inventory: &'a [Inventory],
    items_ready: &'a BTreeMap<String, f64>,
    recall_ready: f64,
    tome_ready: f64,
    pots: u32,
    stats: &'a Stats,
    potion_until: f64,
    can_shop: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    impact: Option<(u8, u8, f64)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    marks: Option<&'a [usize]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    prepared: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    weave_ready: Option<&'a BTreeMap<String, f64>>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum HeroView<'a> {
    Hidden {
        #[serde(flatten)]
        identity: Identity<'a>,
        concealed: bool,
    },
    Visible {
        #[serde(flatten)]
        unit: Basic,
        #[serde(flatten)]
        public: PublicHero<'a>,
        #[serde(flatten, skip_serializing_if = "Option::is_none")]
        private: Option<PrivateHero<'a>>,
    },
}

struct ProjectileRow<'a>(&'a Projectile, &'a str);
fn quant(n: f64, scale: f64) -> f64 {
    js_round(n * scale) / scale
}
impl Serialize for ProjectileRow<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let p = self.0;
        let mut row = serializer.serialize_seq(None)?;
        row.serialize_element(&p.id)?;
        row.serialize_element(&p.team)?;
        row.serialize_element(if matches!(p.shot, Shot::Attack { .. }) {
            "attack"
        } else {
            "bolt"
        })?;
        row.serialize_element(&quant(p.pos.x, 10.0))?;
        row.serialize_element(&quant(p.pos.y, 10.0))?;
        row.serialize_element(self.1)?;
        if let Shot::Bolt { dir, spell, .. } = &p.shot {
            row.serialize_element(&quant(dir.x, 100.0))?;
            row.serialize_element(&quant(dir.y, 100.0))?;
            row.serialize_element(&spell.radius)?;
            let trail = if spell.lift > 0.0 {
                Some("wind")
            } else if spell.push > 0.0 {
                Some("shockwave")
            } else if spell.roll > 0.0 {
                Some("meteor")
            } else {
                None
            };
            row.serialize_element(&trail)?;
            row.serialize_element(&spell.name)?;
        }
        row.end()
    }
}

struct AreaRow<'a>(&'a Area, &'a str);
impl Serialize for AreaRow<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let a = self.0;
        let mut row = serializer.serialize_seq(None)?;
        row.serialize_element(&a.id)?;
        row.serialize_element(&a.team)?;
        row.serialize_element(&a.spell.radius)?;
        row.serialize_element(&a.pos.x)?;
        row.serialize_element(&a.pos.y)?;
        row.serialize_element(&a.time)?;
        row.serialize_element(&a.duration)?;
        row.serialize_element(self.1)?;
        row.serialize_element(&a.ultimate)?;
        let style = match a.spell.kind {
            Kind::Meteor => Some("meteor"),
            Kind::Wall => Some("wall"),
            _ => None,
        };
        row.serialize_element(&style)?;
        row.serialize_element(&a.spell.name)?;
        if a.spell.kind == Kind::Wall {
            row.serialize_element(&[
                a.dir.x,
                a.dir.y,
                a.spell.wall_depth,
                a.time + f64::from(a.hits - 1) * a.spell.interval,
            ])?;
        }
        row.end()
    }
}

type CreepRow = (
    Id,
    usize,
    &'static str,
    f64,
    f64,
    f64,
    f64,
    bool,
    f64,
    f64,
    u8,
);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct World<'a> {
    time: f64,
    mode: &'static str,
    winner: Option<usize>,
    end_reason: Option<&'a str>,
    orb: Option<Orb>,
    wave: u32,
    kills: [u32; 2],
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    team_match: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    training: Option<&'a Training>,
    buildings: Vec<Building>,
    creeps: Vec<CreepRow>,
    projectiles: Vec<ProjectileRow<'a>>,
    areas: Vec<AreaRow<'a>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct View<'a> {
    heroes: Vec<HeroView<'a>>,
    effects: Vec<&'a Value>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    effects_delta: bool,
}

impl Match {
    fn view(&self, seat: usize, full: bool, after: Option<u64>) -> View<'_> {
        let player = self.heroes.get(seat).copied().unwrap_or(self.heroes[0]);
        let team = self.u(player).team;
        let heroes = self
            .heroes
            .iter()
            .copied()
            .map(|id| {
                let u = self.u(id);
                let h = self.h(id);
                let time = self.time;
                let veiled = u.veiled(time);
                if veiled && u.team != team && !full {
                    return HeroView::Hidden {
                        identity: Identity {
                            id,
                            role: "hero",
                            team: u.team,
                            hero: &h.key,
                            name: &h.name,
                            level: h.level,
                            computer: h.bot.is_some(),
                            loadout: h.inventory.iter().map(|item| item.id.as_str()).collect(),
                        },
                        concealed: true,
                    };
                }
                let kit = h.kit();
                let public = PublicHero {
                    hero: &h.key,
                    name: &h.name,
                    level: h.level,
                    computer: h.bot.is_some(),
                    channel: h.channel,
                    mana: h.mana,
                    max_mana: h.max_mana,
                    deaths: h.deaths,
                    last_hits: h.last_hits,
                    denies: h.denies,
                    jump: h.jump,
                    facing: u.facing,
                    buffs: h.buffs.iter().map(|b| b.id.as_str()).collect(),
                    potion_active: h.potion_until > time,
                    loadout: h.inventory.iter().map(|i| i.id.as_str()).collect(),
                    spell_barrier: h
                        .spell_barrier
                        .as_ref()
                        .filter(|barrier| barrier.until > time && barrier.health > 0.0)
                        .map(|barrier| barrier.health),
                    cyclone_until: (u.cyclone_until > time).then_some(u.cyclone_until),
                    respawn: (h.deaths > 0).then_some(h.respawn),
                    heat: kit.heat.as_ref().map(|_| h.heat),
                    dummy: u.dummy,
                    veiled,
                    lifted: u.lift_until > time,
                    burning: u.burn.is_some(),
                    stitched: u.stitch.is_some_and(|m| m.until > time),
                    resonating: u.resonance.is_some_and(|m| m.until > time),
                    disarmed: u.disarmed_until > time,
                };
                let private = (id == player || full).then(|| PrivateHero {
                    gold: h.gold,
                    xp: h.xp,
                    cd: &h.cd,
                    inventory: &h.inventory,
                    items_ready: &h.items_ready,
                    recall_ready: h.recall_ready,
                    tome_ready: h.tome_ready,
                    pots: h.pots,
                    stats: &h.stats,
                    potion_until: h.potion_until,
                    can_shop: self.can_shop(id),
                    impact: (stat(&h.stats, "bash") > 0.0)
                        .then(|| (h.impact_hits, h.impact_threshold(), h.impact_ready)),
                    marks: kit.weaves.as_ref().map(|_| h.marks.as_slice()),
                    prepared: kit.weaves.as_ref().map(|_| h.prepared.as_slice()),
                    weave_ready: kit.weaves.as_ref().map(|_| &h.weave_ready),
                });
                HeroView::Visible {
                    unit: Basic::new(u, time),
                    public,
                    private,
                }
            })
            .collect();
        let start = after.map_or(0, |id| {
            self.effects
                .partition_point(|e| e["id"].as_u64().unwrap_or(0) <= id)
        });
        let effects = self.effects[start..]
            .iter()
            .filter(|e| {
                full || (e["audience"].as_u64().is_none_or(|id| id == team as u64)
                    && e["audienceSeat"]
                        .as_u64()
                        .is_none_or(|id| id == seat as u64))
            })
            .collect();
        View {
            heroes,
            effects,
            effects_delta: after.is_some(),
        }
    }

    fn world(&self) -> World<'_> {
        let t = self.time;
        World {
            time: t,
            mode: if self.ended() { "ended" } else { "match" },
            winner: self.winner,
            end_reason: self.end_reason.as_deref(),
            orb: self.orb,
            wave: self.wave,
            kills: self.kills,
            team_match: self.team_match,
            training: self.training.as_ref(),
            buildings: self
                .buildings
                .iter()
                .map(|&id| {
                    let u = self.u(id);
                    Building {
                        unit: Basic::new(u, t),
                        kind: u.kind,
                        protected: self.protected(id),
                        range: (u.kind != "core").then_some(u.range),
                        target: (u.kind != "core")
                            .then(|| u.windup.map(|w| w.target).or(u.target))
                            .flatten(),
                    }
                })
                .collect(),
            creeps: self
                .creeps
                .iter()
                .map(|&id| {
                    let c = self.u(id);
                    let flags = u8::from(c.stun_until > t)
                        | (u8::from(c.horn_until > t) << 1)
                        | (u8::from(c.hp < c.max_hp / 2.0 && !c.sentry) << 2)
                        | (u8::from(c.sentry) << 3)
                        | (u8::from(c.lift_until > t) << 4);
                    (
                        id,
                        c.team,
                        c.kind,
                        quant(c.pos.x, 10.0),
                        quant(c.pos.y, 10.0),
                        c.hp.ceil(),
                        c.max_hp.ceil(),
                        c.windup.is_some(),
                        quant(c.r, 10.0),
                        quant(c.facing, 100.0),
                        flags,
                    )
                })
                .collect(),
            projectiles: self
                .projectiles
                .iter()
                .map(|p| ProjectileRow(p, self.u(p.from).source_name()))
                .collect(),
            areas: self
                .areas
                .iter()
                .map(|a| AreaRow(a, self.u(a.from).source_name()))
                .collect(),
        }
    }

    pub fn snapshot_world(&self) -> String {
        serde_json::to_string(&self.world()).expect("serializing world")
    }
    pub fn effect_cursor(&self) -> u64 {
        self.next_effect
    }
    pub fn snapshot_view(&self, seat: usize, full: bool, after: Option<u64>) -> String {
        serde_json::to_string(&self.view(seat, full, after)).expect("serializing seat")
    }
    pub fn snapshot(&self, team: usize, full: bool) -> String {
        #[derive(Serialize)]
        struct Snapshot<'a> {
            #[serde(flatten)]
            world: World<'a>,
            #[serde(flatten)]
            view: View<'a>,
        }
        serde_json::to_string(&Snapshot {
            world: self.world(),
            view: self.view(team, full, None),
        })
        .expect("serializing match")
    }
}
