use super::{orders::Command, *};

const DT: f64 = 1.0 / 60.0;

fn duel(heroes: [&str; 2]) -> Match {
    Match::from_options(&json!({"heroes": heroes, "bots": [null, null], "seed": 44}).to_string())
        .unwrap()
}
fn training(hero: &str, dummy: bool) -> Match {
    Match::from_options(
        &json!({"heroes": [hero,"brakk"], "training": {"dummy":dummy}, "seed": 17}).to_string(),
    )
    .unwrap()
}
fn place(game: &mut Match, id: Id, x: f64, y: f64) {
    game.u_mut(id).pos = Point::new(x, y);
}
fn prepare(m: &mut Match, recipe: &str) {
    for key in recipe.bytes() {
        let slot = b"QWE".iter().position(|&v| v == key).unwrap();
        m.command(1, Command::cast(slot, Point::default(), None))
            .unwrap();
    }
    m.command(1, Command::cast(3, Point::default(), None))
        .unwrap();
}
fn cast(m: &mut Match, slot: usize, at: Point) {
    m.command(1, Command::cast(slot, at, None)).unwrap();
}
fn view(m: &Match, team: usize) -> Value {
    serde_json::from_str(&m.snapshot(team, false)).unwrap()
}

#[test]
fn team_battle_has_independent_lanes_and_fountain_defense() {
    let mut m = Match::from_options(
        &json!({"team_match":true,"bots":[null,null,null,null,null,null,null,null,null,null]})
            .to_string(),
    )
    .unwrap();
    assert_eq!(m.heroes.len(), 10);
    assert!(m.home(0).x < m.home(1).x && m.home(0).y > m.home(1).y);
    assert_eq!(m.buildings.len(), 14);
    let outer = m.lane_building(0, 0, "outer").unwrap();
    let inner = m.lane_building(0, 0, "inner").unwrap();
    assert!(m.protected(inner));
    m.u_mut(outer).hp = 0.0;
    assert!(!m.protected(inner));
    assert!(m.protected(m.lane_building(0, 1, "inner").unwrap()));
    let core = m.building(0, "core").unwrap();
    assert!(m.protected(core));
    m.u_mut(inner).hp = 0.0;
    assert!(!m.protected(core));
    m.step(DT, 121);
    assert_eq!(m.creeps.len(), 24);
    for lane in 0..3 {
        assert_eq!(
            m.creeps.iter().filter(|&&id| m.u(id).lane == lane).count(),
            8
        );
    }
    let invader = m.heroes[5];
    let home = m.home(0);
    let initial = m.u(invader).hp;
    place(&mut m, invader, home.x, home.y);
    m.step(DT, 1);
    assert!(m.u(invader).hp < initial - 300.0);
    assert!(m.effects.iter().any(|effect| effect["kind"] == "fountain"));
    m.step(DT, 35);
    assert_eq!(m.u(invader).hp, 0.0);
}

#[test]
fn waves_spawn_symmetrically_and_movement_clears_the_fountain() {
    let mut m = duel(["brakk", "orrin"]);
    m.command(1, Command::Move(Point::new(1700.0, 450.0)))
        .unwrap();
    m.step(DT, 120);
    assert_eq!(m.creeps.len(), 8);
    assert_eq!(m.u(m.creeps[0]).hp, 420.0);
    m.step(DT, 300);
    assert!(m.u(1).pos.x > 1000.0);
    assert_eq!(m.u(1).hp, 780.0);
}

#[test]
fn creep_aggro_transfers_to_allies_and_can_be_redrawn_after_cooldown() {
    let mut m = duel(["brakk", "orrin"]);
    m.step(DT, 120);
    let ally = m.creeps[0];
    let enemy = m.creeps[4];
    place(&mut m, 1, 2450.0, 450.0);
    place(&mut m, 2, 3650.0, 450.0);
    place(&mut m, ally, 2300.0, 450.0);
    place(&mut m, enemy, 2480.0, 450.0);
    m.u_mut(enemy).windup = Some(Windup {
        target: ally,
        time: 8.0,
    });
    m.command(1, Command::Attack(2)).unwrap();
    assert_eq!(m.u(enemy).target, Some(1));
    assert!(m.u(enemy).windup.is_none());
    m.command(1, Command::Attack(ally)).unwrap();
    assert_eq!(m.u(enemy).target, Some(ally));
    assert!(matches!(m.h(1).order, Order::Stop));
    m.command(1, Command::Attack(2)).unwrap();
    assert_eq!(m.u(enemy).target, Some(ally));
    m.time += 3.0;
    m.command(1, Command::Attack(2)).unwrap();
    assert_eq!(m.u(enemy).target, Some(1));
    m.u_mut(ally).hp = 100.0;
    m.command(1, Command::Attack(ally)).unwrap();
    assert!(matches!(m.h(1).order, Order::Attack(id) if id == ally));
}

#[test]
fn buying_nested_items_preserves_refunds_and_active_item_cooldowns() {
    let mut m = duel(["brakk", "orrin"]);
    m.h_mut(1).gold = 6_000.0;
    for key in ["stone", "gloves", "executioner"] {
        m.buy(1, key).unwrap();
    }
    assert_eq!(m.h(1).inventory.len(), 1);
    assert_eq!(m.h(1).inventory[0].id, "executioner");
    assert_eq!(stat(&m.h(1).stats, "damage"), 111.0);
    m.command(1, Command::Sell(0)).unwrap();
    assert_eq!(m.h(1).gold, 6_000.0);
    m.buy(1, "locket").unwrap();
    m.command(1, Command::Item(0, Point::default())).unwrap();
    m.command(1, Command::Sell(0)).unwrap();
    m.buy(1, "locket").unwrap();
    assert!(
        m.command(1, Command::Item(0, Point::default()))
            .unwrap_err()
            .contains("cooling")
    );
    place(&mut m, 1, 1200.0, 450.0);
    assert!(m.buy(1, "boots").unwrap_err().contains("fountain"));
}

#[test]
fn void_core_keeps_component_credit_and_reduces_spell_cooldown() {
    let mut m = duel(["orrin", "brakk"]);
    m.h_mut(1).gold = 3000.0;
    m.buy(1, "arcane").unwrap();
    m.buy(1, "rune").unwrap();
    m.time = 11.0;
    m.buy(1, "void").unwrap();
    assert_eq!(m.h(1).max_mana, 680.0);
    assert!((stat(&m.h(1).stats, "manaRegen") - 4.3).abs() < 1e-10);
    assert_eq!(m.h(1).inventory[0].spent, 1425.0);
    assert_eq!(m.spell_damage(1, m.h(1).spell(0).unwrap()), 126.0);
    cast(&mut m, 0, Point::new(650.0, 450.0));
    assert!((m.h(1).cd[0] - 15.8).abs() < 1e-10);
}

#[test]
fn war_horn_requires_allies_and_never_rallies_the_other_team() {
    let mut m = duel(["brakk", "orrin"]);
    m.h_mut(1).gold = 1500.0;
    m.buy(1, "horn").unwrap();
    assert!(m.command(1, Command::Item(0, Point::default())).is_err());
    assert!(!m.h(1).items_ready.contains_key("horn"));
    m.step(DT, 120);
    m.command(1, Command::Item(0, Point::default())).unwrap();
    assert!(m.u(m.creeps[0]).horn_until > m.time);
    assert_eq!(m.u(m.creeps[4]).horn_until, 0.0);
}

#[test]
fn denies_award_reduced_experience_and_the_core_requires_both_towers() {
    let mut m = duel(["brakk", "orrin"]);
    m.step(DT, 120);
    let creep = m.creeps[0];
    m.u_mut(2).pos = m.u(creep).pos.projected(Point::new(1.0, 0.0), 150.0);
    m.u_mut(creep).hp = 1.0;
    m.attack_hit(1, creep, 63.0);
    assert_eq!(m.h(2).xp, 18.0);
    assert_eq!(m.h(1).denies, 1);
    let core = m.building(1, "core").unwrap();
    let outer = m.building(1, "outer").unwrap();
    let inner = m.building(1, "inner").unwrap();
    m.hurt(core, 50_000.0, 1, false, false);
    m.hurt(outer, 50_000.0, 1, true, false);
    assert_eq!(m.u(core).hp, 3000.0);
    assert_eq!(m.u(outer).hp, 1300.0);
    for id in [outer, inner, core] {
        m.hurt(id, 50_000.0, 1, false, false);
    }
    assert_eq!(m.winner, Some(0));
    assert_eq!(m.end_reason.as_deref(), Some("core"));
}

#[test]
fn equipment_and_temporary_buffs_update_movement_and_attack_stats() {
    let mut m = duel(["vesper", "brakk"]);
    m.gain_xp(1, 500.0);
    let haste = stat(&m.h(1).stats, "haste");
    m.buy(1, "boots").unwrap();
    assert_eq!(stat(&m.h(1).stats, "speed"), 350.0);
    cast(&mut m, 2, Point::new(110.0, 450.0));
    m.step(DT, 6);
    assert_eq!(stat(&m.h(1).stats, "haste"), haste + 0.5);
    assert!(stat(&m.h(1).stats, "speed") > 350.0);
    m.step(DT, 300);
    assert_eq!(stat(&m.h(1).stats, "haste"), haste);
    assert_eq!(stat(&m.h(1).stats, "speed"), 350.0);
}

#[test]
fn every_standard_kit_enforces_unlocks_and_cast_costs() {
    for (hero, kit) in &rules().heroes {
        if kit.weaves.is_some() {
            continue;
        }
        let mut m = duel([hero, "brakk"]);
        let point = Point::new(650.0, 450.0);
        if kit.unlocks.is_none() {
            assert!(
                m.command(1, Command::cast(1, point, None))
                    .unwrap_err()
                    .contains("level 2")
            );
        }
        cast(&mut m, 0, point);
        assert_eq!(m.h(1).mana, m.h(1).max_mana - kit.abilities[0].mana);
        m.step(DT, 60);
        assert!(
            m.command(1, Command::cast(0, point, None))
                .unwrap_err()
                .contains("cooling")
        );
    }
}

#[test]
fn every_mark_recipe_casts_and_slots_keep_their_own_cooldowns() {
    for (recipe, spell) in rules().heroes["neris"].weaves.as_ref().unwrap() {
        let mut m = duel(["neris", "brakk"]);
        place(&mut m, 2, 670.0, 450.0);
        let reverse: String = recipe.chars().rev().collect();
        prepare(&mut m, &reverse);
        assert_eq!(&m.h(1).prepared[0], recipe);
        let before = m.h(1).mana;
        m.command(1, Command::cast(4, Point::new(670.0, 450.0), Some(2)))
            .unwrap();
        assert_eq!(m.h(1).mana, before - spell.mana);
        assert_eq!(m.h(1).weave_ready[recipe], spell.cd);
    }
    let mut m = duel(["neris", "brakk"]);
    prepare(&mut m, "WWQ");
    cast(&mut m, 4, Point::new(650.0, 450.0));
    m.time = m.h(1).cd[3];
    prepare(&mut m, "QWE");
    assert_eq!(m.h(1).prepared, ["QWE", "QWW"]);
    assert!(
        m.command(1, Command::cast(5, Point::new(650.0, 450.0), None))
            .unwrap_err()
            .contains("cooling")
    );
}

#[test]
fn pin_stitch_requires_a_visible_enemy_and_veil_only_reveals_on_attack_or_spell() {
    let mut m = duel(["neris", "brakk"]);
    place(&mut m, 1, 2000.0, 450.0);
    place(&mut m, 2, 2320.0, 450.0);
    prepare(&mut m, "QQW");
    cast(&mut m, 4, Point::new(2000.0, 450.0));
    assert!(view(&m, 1)["heroes"][0]["x"].is_null());
    assert_eq!(view(&m, 1)["heroes"][0]["concealed"], true);
    assert!(m.command(2, Command::Attack(1)).is_err());
    m.command(1, Command::Move(Point::new(2050.0, 450.0)))
        .unwrap();
    m.step(DT, 91);
    prepare(&mut m, "QQQ");
    assert!(m.u(1).veiled(m.time));
    assert!(
        m.command(1, Command::cast(4, Point::default(), Some(1)))
            .is_err()
    );
    let flying = m.projectiles.len();
    m.command(1, Command::cast(4, Point::default(), Some(2)))
        .unwrap();
    assert!(!m.u(1).veiled(m.time));
    assert!(m.u(2).stitch.is_some());
    assert!(m.u(2).stun_until > m.time);
    assert_eq!(m.projectiles.len(), flying);
}

#[test]
fn training_tornado_lifts_meteor_burns_and_shockwave_disarms_the_dummy() {
    let mut m = training("neris", true);
    let dummy = m.u(2).pos;
    let hp = m.u(2).hp;
    let mana = m.h(1).mana;
    prepare(&mut m, "WWQ");
    cast(&mut m, 4, dummy);
    prepare(&mut m, "EEW");
    cast(&mut m, 4, dummy);
    m.step(DT, 36);
    assert!(m.u(2).lift_until > m.time);
    assert!(m.u(2).burn.is_some());
    prepare(&mut m, "QWE");
    cast(&mut m, 4, dummy);
    m.step(DT, 28);
    assert!(m.u(2).disarmed_until > m.time);
    m.step(DT, 120);
    assert!(m.training.as_ref().unwrap().hits >= 7);
    assert_eq!(m.u(2).hp, hp);
    assert_eq!(m.u(2).pos, dummy);
    assert_eq!(m.h(1).mana, mana);
    assert!(m.h(1).weave_ready.is_empty());
}

#[test]
fn cairn_casts_three_ranges_along_facing_and_training_restores_heat() {
    let mut m = training("cairn", false);
    let start = m.u(1).pos;
    for (slot, offset) in [235.0, 460.0, 700.0].into_iter().enumerate() {
        cast(&mut m, slot, Point::new(start.x - 500.0, start.y - 90.0));
        assert_eq!(m.areas[slot].pos.x, start.x + offset);
        assert_eq!(m.areas[slot].pos.y, start.y);
    }
    cast(&mut m, 3, start);
    assert_eq!(m.h(1).heat, 0);
    m.step(DT, 1);
    assert_eq!(m.h(1).heat, 6);
    assert_eq!(m.training.as_ref().unwrap().hits, 0);
}

#[test]
fn ecarg_resonance_only_boosts_one_followup() {
    let mut m = training("ecarg", true);
    let point = m.u(2).pos;
    cast(&mut m, 0, point);
    m.step(DT, 29);
    assert!(m.u(2).resonance.is_some());
    cast(&mut m, 1, point);
    m.step(DT, 29);
    assert!(m.u(2).resonance.is_none());
    let damage = m.training.as_ref().unwrap().last_hit;
    assert!(m.u(2).stun_until > m.time);
    cast(&mut m, 1, point);
    m.step(DT, 29);
    assert!(damage > m.training.as_ref().unwrap().last_hit);
}

#[test]
fn recall_cancels_on_move_then_completes_on_an_uninterrupted_channel() {
    let mut m = duel(["brakk", "orrin"]);
    place(&mut m, 1, 1900.0, 300.0);
    m.command(1, Command::Recall).unwrap();
    m.step(DT, 70);
    m.command(1, Command::Move(Point::new(1800.0, 300.0)))
        .unwrap();
    m.step(DT, 180);
    assert!(m.u(1).pos.x > 1000.0);
    m.command(1, Command::Recall).unwrap();
    m.step(DT, 181);
    assert_eq!(m.u(1).pos, m.home(0));
    assert!(m.h(1).recall_ready > m.time);
}

#[test]
fn normal_bots_close_out_matches_at_their_existing_difficulty() {
    for (bots, seed) in [
        (json!([null, "normal"]), 17),
        (json!(["normal", "normal"]), 88),
    ] {
        let mut m = Match::from_options(&json!({"bots":bots,"seed":seed}).to_string()).unwrap();
        m.step(DT, 108_000);
        assert!(m.ended());
        assert_eq!(m.end_reason.as_deref(), Some("core"));
    }
}
