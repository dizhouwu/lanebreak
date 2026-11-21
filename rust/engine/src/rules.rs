use serde::Deserialize;
use std::{collections::BTreeMap, sync::OnceLock};

pub type Stats = BTreeMap<String, f64>;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    #[default]
    Prepared,
    Mark,
    Invoke,
    Bolt,
    Blast,
    Nova,
    Dash,
    Blink,
    Buff,
    Unit,
    Sentry,
    Meteor,
    Veil,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Prepared => "prepared",
            Self::Mark => "mark",
            Self::Invoke => "invoke",
            Self::Bolt => "bolt",
            Self::Blast => "blast",
            Self::Nova => "nova",
            Self::Dash => "dash",
            Self::Blink => "blink",
            Self::Buff => "buff",
            Self::Unit => "unit",
            Self::Sentry => "sentry",
            Self::Meteor => "meteor",
            Self::Veil => "veil",
        }
    }
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Spell {
    pub name: String,
    pub kind: Kind,
    pub mana: f64,
    pub cd: f64,
    pub range: f64,
    pub radius: f64,
    pub speed: f64,
    pub piercing: bool,
    pub fixed: bool,
    pub damage: f64,
    pub growth: f64,
    pub heat_damage: f64,
    pub slow: f64,
    pub slow_time: f64,
    pub stun: f64,
    pub lift: f64,
    pub delay: f64,
    pub hits: u32,
    pub interval: f64,
    pub duration: f64,
    pub stats: Stats,
    pub drain: f64,
    pub stitch: bool,
    pub push: f64,
    pub disarm: f64,
    pub resonance: f64,
    pub accent: f64,
    pub accent_stun: f64,
    pub burn_ticks: u32,
    pub burn_interval: f64,
    pub burn_scale: f64,
    pub roll: f64,
    pub health: f64,
    pub shot: f64,
    pub shot_growth: f64,
}

impl Spell {
    pub fn cast_mode(&self) -> &'static str {
        match self.kind {
            Kind::Unit => "unit",
            Kind::Blast if !self.fixed && self.range > 0.0 => "point",
            Kind::Bolt | Kind::Dash | Kind::Blink | Kind::Sentry | Kind::Meteor => "point",
            _ => "self",
        }
    }
}

#[derive(Deserialize)]
pub struct Heat {
    pub max: u32,
    pub attack: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Kit {
    pub name: String,
    pub hp: f64,
    pub hp_growth: f64,
    pub mana: f64,
    pub mana_growth: f64,
    pub damage: f64,
    pub damage_growth: f64,
    pub armor: f64,
    pub armor_growth: f64,
    pub range: f64,
    pub interval: f64,
    pub speed: f64,
    pub speed_growth: f64,
    pub regen: f64,
    pub mana_regen: f64,
    pub abilities: Vec<Spell>,
    pub build: Vec<String>,
    pub heat: Option<Heat>,
    pub unlocks: Option<Vec<u32>>,
    pub weaves: Option<BTreeMap<String, Spell>>,
}

#[derive(Deserialize)]
pub struct Item {
    pub cost: f64,
    pub total: f64,
    #[serde(default)]
    pub cd: f64,
    #[serde(default)]
    pub parts: Vec<String>,
    #[serde(default)]
    pub stats: Stats,
}

#[derive(Deserialize)]
pub struct Creep {
    pub hp: f64,
    pub damage: f64,
    pub armor: f64,
    pub range: f64,
    pub interval: f64,
    pub speed: f64,
    pub r: f64,
    pub gold: f64,
    pub xp: f64,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Difficulty {
    pub react: f64,
    pub last_hit: f64,
    pub deny: bool,
    pub cast: f64,
    pub lead: f64,
    pub noise: f64,
    pub harass: f64,
    pub kill_judge: f64,
}

#[derive(Deserialize)]
pub struct TeamMap {
    pub height: f64,
    pub fountains: [[f64; 2]; 2],
    pub lanes: Vec<Vec<[f64; 2]>>,
}

#[derive(Deserialize)]
pub struct Rules {
    #[serde(rename = "HEROES")]
    pub heroes: BTreeMap<String, Kit>,
    #[serde(rename = "ITEMS")]
    pub items: BTreeMap<String, Item>,
    #[serde(rename = "CREEPS")]
    pub creeps: BTreeMap<String, Creep>,
    #[serde(rename = "DIFF")]
    pub difficulty: BTreeMap<String, Difficulty>,
    #[serde(rename = "WIDTH")]
    pub width: f64,
    #[serde(rename = "HEIGHT")]
    pub height: f64,
    #[serde(rename = "TEAM_MAP")]
    pub team_map: TeamMap,
    #[serde(rename = "UNLOCKS")]
    pub unlocks: Vec<u32>,
    #[serde(rename = "TEAM")]
    pub teams: Vec<String>,
}

pub fn rules() -> &'static Rules {
    static RULES: OnceLock<Rules> = OnceLock::new();
    RULES.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src/rules.json"))
            .expect("invalid Lanebreak rules")
    })
}
