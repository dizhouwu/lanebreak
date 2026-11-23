use super::{orders::Command, *};

const DT: f64 = 1.0 / 60.0;

#[test]
fn insight_rune_spawns_and_grants_experience_on_both_maps() {
    for team_match in [false, true] {
        let mut m = Match::from_options(
            &json!({"team_match":team_match, "bots":[null,null,null,null,null,null,null,null,null,null]})
                .to_string(),
        )
        .unwrap();
        m.rng = 9;
        m.next_wave = f64::INFINITY;
        m.time = m.next_orb;
        m.step(DT, 1);

        let rune = m.orb.unwrap();
        assert_eq!(rune.kind, "Insight");
        let player = m.heroes[0];
        assert_eq!(m.h(player).xp, 0.0);
        place(&mut m, player, rune.pos.x, rune.pos.y);
        m.step(DT, 1);
        assert!(m.orb.is_none());
        assert_eq!(m.h(player).level, 2);
        assert_eq!(m.h(player).xp, 20.0);
        assert_eq!(m.next_orb, m.time + 75.0);
    }
}

#[test]
fn personal_kda_counts_recent_damage_once_and_is_public_when_concealed() {
    let mut m = Match::from_options(r#"{"team_match":true}"#).unwrap();
    let (killer, helper, expired, victim) = (m.heroes[0], m.heroes[1], m.heroes[2], m.heroes[5]);
    m.hurt(victim, 10.0, expired, false, false);
    m.time += 11.0;
    m.hurt(victim, 10.0, helper, false, false);
    m.hurt(victim, 10.0, helper, false, false);
    m.hurt(victim, 4000.0, killer, false, false);
    assert_eq!(m.h(killer).kills, 1);
    assert_eq!(m.h(killer).assists, 0);
    assert_eq!(m.h(helper).assists, 1);
    assert_eq!(m.h(expired).assists, 0);
    assert_eq!(m.h(victim).deaths, 1);
    assert!(m.h(victim).recent_hero_damage.is_empty());
    m.u_mut(killer).veil_until = m.time + 4.0;
    let snapshot = view(&m, 5);
    let concealed = &snapshot["heroes"][0];
    assert_eq!(concealed["concealed"], true);
    assert_eq!(concealed["kills"], 1);
    assert_eq!(snapshot["heroes"][1]["assists"], 1);
    assert_eq!(snapshot["heroes"][5]["deaths"], 1);
    assert!(concealed.get("x").is_none());
}

#[test]
fn dust_exposes_enemies_in_radius_until_it_expires() {
    let mut m = duel(["vesper", "neris"]);
    m.buy(1, "dust").unwrap();
    m.buy(1, "dust").unwrap();
    m.time = 1.0;
    place(&mut m, 1, 2050.0, 450.0);
    place(&mut m, 2, 2700.0, 450.0);
    m.u_mut(2).veil_until = 25.0;
    assert_eq!(view(&m, 0)["heroes"][1]["concealed"], true);

    m.command(1, Command::Item(0, Point::default())).unwrap();
    assert_eq!(m.h(1).inventory.len(), 1);
    let snapshot = view(&m, 0);
    assert_eq!(snapshot["heroes"][1]["revealed"], true);
    assert!(snapshot["heroes"][1].get("veiled").is_none());
    assert_eq!(snapshot["heroes"][1]["x"], 2700.0);
    assert!(m.command(1, Command::Attack(2)).is_ok());
    assert!(m.command(1, Command::Item(0, Point::default())).is_err());
    m.time = 7.0;
    assert_eq!(view(&m, 0)["heroes"][1]["concealed"], true);

    m.time = 13.0;
    place(&mut m, 2, 2701.0, 450.0);
    m.command(1, Command::Item(0, Point::default())).unwrap();
    assert!(m.h(1).inventory.is_empty());
    assert_eq!(view(&m, 0)["heroes"][1]["concealed"], true);
}

#[test]
fn hero_kills_announce_streaks_and_deaths_reset_them() {
    let mut m = duel(["brakk", "vesper"]);
    for kills in 1..=10 {
        m.u_mut(2).hp = 1.0;
        m.kill(2, 1, false);
        assert_eq!(m.h(1).kill_streak, kills);
        let event = m.effects.last().unwrap();
        assert_eq!(event["kind"], "kill");
        assert_eq!(event["attacker"], m.h(1).name);
        assert_eq!(event["victim"], m.h(2).name);
        let title = [
            Some("First Blood"),
            None,
            Some("Killing Spree"),
            Some("Dominating"),
            Some("Mega Kill"),
            Some("Unstoppable"),
            Some("Wicked Sick"),
            Some("Monster Kill"),
            Some("Godlike"),
            Some("Holy Shit"),
        ][kills as usize - 1];
        assert_eq!(event["announcement"].as_str(), title);
    }
    let tower = m
        .buildings
        .iter()
        .copied()
        .find(|&id| {
            let tower = m.u(id);
            tower.team == 1 && tower.kind != "core"
        })
        .unwrap();
    m.kill(1, tower, false);
    assert_eq!(m.h(1).kill_streak, 0);
    assert_eq!(m.h(2).kill_streak, 0);
    let event = m.effects.last().unwrap();
    assert_eq!(event["kind"], "kill");
    assert_eq!(event["attacker"], "Crimson Tower");
}

#[test]
fn rapid_hero_kills_reach_rampage_and_reset_on_timeout_or_death() {
    let mut m = Match::from_options(r#"{"team_match":true}"#).unwrap();
    let attacker = m.heroes[0];
    let enemies = m.heroes[5..].to_vec();
    for (index, title) in [
        None,
        Some("Double Kill"),
        Some("Triple Kill"),
        Some("Ultra Kill"),
        Some("Rampage"),
        Some("Rampage"),
    ]
    .into_iter()
    .enumerate()
    {
        m.time = index as f64 * 12.0;
        let victim = enemies[index % enemies.len()];
        m.u_mut(victim).hp = 1.0;
        m.kill(victim, attacker, false);
        let event = m.effects.last().unwrap();
        assert_eq!(event["multiKill"], index + 1);
        assert_eq!(event["multiKillAnnouncement"].as_str(), title);
        if index == 4 {
            assert_eq!(event["announcement"], "Mega Kill");
        }
    }
    m.time += 12.01;
    let victim = enemies[0];
    m.u_mut(victim).hp = 1.0;
    m.kill(victim, attacker, false);
    let event = m.effects.last().unwrap();
    assert_eq!(event["multiKill"], 1);
    assert_eq!(event["announcement"], "Wicked Sick");

    m.u_mut(victim).hp = 1.0;
    m.kill(attacker, victim, false);
    assert_eq!(m.h(attacker).multi_kill, None);
    m.u_mut(attacker).hp = 1.0;
    m.kill(victim, attacker, false);
    let event = m.effects.last().unwrap();
    assert_eq!(event["multiKill"], 1);
    assert_eq!(event["streak"], 1);
}

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
fn re_invoking_a_prepared_spell_swaps_slots_without_spending_r_cooldown() {
    let mut m = duel(["neris", "orrin"]);
    prepare(&mut m, "WWQ");
    assert_eq!(m.h(1).cd[3], 0.5);
    m.time = 0.51;
    prepare(&mut m, "EEW");
    cast(&mut m, 5, Point::new(400.0, 450.0));
    let invoke_ready = m.h(1).cd[3];
    let tornado_ready = m.h(1).ready_at(5);

    prepare(&mut m, "WWQ");
    assert_eq!(m.h(1).prepared, ["QWW", "WEE"]);
    assert_eq!(m.h(1).ready_at(4), tornado_ready);
    assert_eq!(m.h(1).cd[3], invoke_ready);
    prepare(&mut m, "WWQ");
    assert_eq!(m.h(1).prepared, ["QWW", "WEE"]);
    assert!(m.h(1).marks.is_empty());
    assert_eq!(m.h(1).cd[3], invoke_ready);

    for slot in 0..3 {
        cast(&mut m, slot, Point::default());
    }
    let invoke = Command::cast(3, Point::default(), None);
    assert_eq!(m.command(1, invoke).unwrap_err(), "Ability cooling down");
    m.time = invoke_ready;
    cast(&mut m, 3, Point::default());
    assert_eq!(m.h(1).prepared, ["QWE", "QWW"]);
    assert_eq!(m.h(1).ready_at(5), tornado_ready);
    assert_eq!(m.h(1).cd[3], invoke_ready + 0.5);
}

#[test]
fn faultline_consumes_components_and_shares_its_impact_recovery() {
    let mut m = duel(["brakk", "orrin"]);
    m.h_mut(1).gold = 10_000.0;
    for item in ["stone", "gloves", "gravemark", "bulwark", "faultline"] {
        m.command(1, Command::Buy(item.into())).unwrap();
    }
    assert_eq!(m.h(1).inventory.len(), 1);
    assert_eq!(m.h(1).inventory[0].id, "faultline");
    assert_eq!(m.h(1).gold, 10_000.0 - rules().items["faultline"].total);
    let cast = json!({"o":"targetItem","i":0,"item":"faultline","id":2}).to_string();
    assert!(m.order_json(0, &cast).unwrap().contains("in range"));
    assert!(m.h(1).items_ready.is_empty());
    place(&mut m, 2, 320.0, 450.0);
    for _ in 0..3 {
        m.attack_hit(1, 2, 1.0);
        assert_eq!(m.u(2).stun_until, 0.0);
    }
    assert_eq!(view(&m, 0)["heroes"][0]["impact"][0], 3);
    m.attack_hit(1, 2, 1.0);
    assert!(m.u(2).stun_until > m.time);
    assert!(m.order_json(0, &cast).unwrap().contains("recovering"));
    assert!(m.h(1).items_ready.is_empty());
    m.time += 3.01;
    assert_eq!(m.order_json(0, &cast), None);
    assert!((m.u(2).stun_until - m.time - 1.1).abs() < 1e-8);
    assert_eq!(m.h(1).items_ready["faultline"], m.time + 32.0);
    let until = m.u(2).stun_until;
    for _ in 0..4 {
        m.attack_hit(1, 2, 1.0);
    }
    assert_eq!(m.u(2).stun_until, until);
}

#[test]
fn allied_items_shield_and_reposition_the_selected_hero() {
    let mut m = Match::from_options(&json!({"team_match":true}).to_string()).unwrap();
    let [player, ally, enemy] = [m.heroes[0], m.heroes[1], m.heroes[5]];
    m.h_mut(player).gold = 10_000.0;
    for item in ["spellward", "wayfarer"] {
        m.command(player, Command::Buy(item.into())).unwrap();
    }
    let ward = json!({"o":"targetItem","i":0,"item":"spellward","id":ally}).to_string();
    assert_eq!(m.order_json(0, &ward), None);
    assert_eq!(view(&m, 0)["heroes"][1]["spellBarrier"], 260.0);
    assert!(m.h(player).spell_barrier.is_none());
    let hp = m.u(ally).hp;
    m.hurt(ally, 200.0, enemy, true, false);
    assert_eq!(m.u(ally).hp, hp);
    assert_eq!(m.h(ally).spell_barrier.as_ref().unwrap().health, 110.0);
    m.hurt(ally, 20.0, enemy, false, true);
    assert!(m.u(ally).hp < hp);
    assert_eq!(m.h(ally).spell_barrier.as_ref().unwrap().health, 110.0);
    let push = json!({"o":"targetItem","i":1,"item":"wayfarer","id":ally}).to_string();
    let origin = m.u(ally).pos;
    let until = m.time + 1.0;
    m.u_mut(ally).stun_until = until;
    assert_eq!(m.order_json(0, &push), None);
    assert!((m.u(ally).pos.x - origin.x - 440.0).abs() < 1e-8);
    assert_eq!(m.u(ally).pos.y, origin.y);
    assert_eq!(m.u(ally).stun_until, until);
}

#[test]
fn wellsplitter_burns_hero_mana_and_targets_a_slow() {
    let mut m = duel(["vesper", "orrin"]);
    m.h_mut(1).gold = 10_000.0;
    m.command(1, Command::Buy("wellsplitter".into())).unwrap();
    place(&mut m, 2, 400.0, 450.0);
    let mana = m.h(2).mana;
    m.attack_hit(1, 2, 1.0);
    assert_eq!(m.h(2).mana, mana - 12.0);
    let cast = json!({"o":"targetItem","i":0,"item":"wellsplitter","id":2}).to_string();
    assert_eq!(m.order_json(0, &cast), None);
    assert!(
        m.u(2)
            .slows
            .iter()
            .any(|slow| slow.id == "wellsplitter" && slow.value == 0.5)
    );
}

#[test]
fn frost_loom_spawns_perpendicular_without_aiming_and_only_ticks_inside_the_wall() {
    let mut m = training("neris", true);
    prepare(&mut m, "QQE");
    let start = m.u(1).pos;
    let wall_x = start.x + 80.0;
    place(&mut m, 2, wall_x, start.y + 280.0);
    let order =
        json!({"o":"cast","i":4,"x":start.x-500.0,"y":start.y,"castMode":"self","recipe":"QQE"})
            .to_string();
    assert_eq!(m.order_json(0, &order), None);
    assert_eq!(m.areas[0].pos, Point::new(wall_x, start.y));
    assert_eq!(m.areas[0].dir, Point::new(1.0, 0.0));
    assert_eq!(view(&m, 0)["areas"][0][9], "wall");
    m.step(DT, 12);
    assert!(
        m.u(2)
            .slows
            .iter()
            .any(|s| s.id == "frostloom" && s.value == 0.58)
    );
    assert_eq!(m.training.as_ref().unwrap().hits, 0);
    m.step(DT, 52);
    assert_eq!(m.training.as_ref().unwrap().hits, 1);
    place(&mut m, 2, wall_x + 130.0, start.y + 280.0);
    m.step(DT, 250);
    assert_eq!(m.training.as_ref().unwrap().hits, 1);
    assert!(m.areas.is_empty());
}

#[test]
fn rift_stone_blinks_to_a_point_and_respects_range_and_combat_lock() {
    let mut m = training("brakk", true);
    m.command(1, Command::Buy("rift".into())).unwrap();
    let origin = m.u(1).pos;
    let click = Point::new(origin.x + 220.0, origin.y + 95.0);
    let order = json!({"o":"item","i":0,"item":"rift","x":click.x,"y":click.y}).to_string();
    m.h_mut(1).last_threat = m.time;
    assert!(
        m.order_json(0, &order)
            .unwrap()
            .contains("disabled in combat")
    );
    assert_eq!(m.u(1).pos, origin);
    m.step(DT, 151);
    assert_eq!(m.order_json(0, &order), None);
    assert_eq!(m.u(1).pos, click);
    m.step(DT, 1);
    let far = json!({"o":"item","i":0,"item":"rift","x":click.x + 900.0,"y":click.y}).to_string();
    assert_eq!(m.order_json(0, &far), None);
    assert!((m.u(1).pos.x - click.x - 520.0).abs() < 1e-8);
}

#[test]
fn tornado_emp_and_rolling_meteor_combo_gains_a_second_hit_from_the_shockwave() {
    for shockwave in [false, true] {
        let mut m = duel(["neris", "orrin"]);
        m.h_mut(1).level = 15;
        m.refresh(1);
        m.h_mut(1).mana = m.h(1).max_mana;
        m.h_mut(2).level = 15;
        m.refresh(2);
        m.u_mut(2).hp = m.u(2).max_hp;
        m.h_mut(2).mana = m.h(2).max_mana;
        let at = Point::new(2640.0, 450.0);
        place(&mut m, 1, 2100.0, at.y);
        place(&mut m, 2, at.x, at.y);
        m.command(1, Command::Stop).unwrap();
        m.command(2, Command::Stop).unwrap();
        prepare(&mut m, "WWQ");
        m.time += 0.8;
        prepare(&mut m, "WWW");
        m.time += 0.8;
        cast(&mut m, 5, at);
        m.step(DT, 24);
        cast(&mut m, 4, at);
        prepare(&mut m, "EEW");
        m.step(DT, 32);
        prepare(&mut m, "QWE");
        m.step(DT, 7);
        cast(&mut m, 5, at);
        m.step(DT, 10);
        if shockwave {
            cast(&mut m, 4, at);
        }
        m.step(DT, 65);
        let meteor = &m.h(1).kit().weaves.as_ref().unwrap()["WEE"];
        let damage = js_round(m.spell_damage(1, meteor) * 0.75).to_string();
        let contacts = m
            .effects
            .iter()
            .filter(|effect| effect["kind"] == "hit" && effect["text"] == damage)
            .count();
        assert_eq!(contacts, if shockwave { 2 } else { 1 });
        assert_eq!(m.u(2).pos.x, at.x + if shockwave { 145.0 } else { 0.0 });
        assert!(m.h(2).mana < m.h(2).max_mana - 60.0);
    }
}

#[test]
fn galeglass_makes_the_target_invulnerable_until_the_landing_combo() {
    let mut m = duel(["neris", "orrin"]);
    m.h_mut(1).gold = 4_000.0;
    m.command(1, Command::Buy("galeglass".into())).unwrap();
    m.h_mut(1).level = 15;
    m.refresh(1);
    m.h_mut(1).mana = m.h(1).max_mana;
    m.h_mut(2).level = 15;
    m.refresh(2);
    m.u_mut(2).hp = m.u(2).max_hp;
    let at = Point::new(2500.0, 450.0);
    place(&mut m, 1, 2100.0, at.y);
    place(&mut m, 2, at.x, at.y);
    m.command(1, Command::Stop).unwrap();
    m.command(2, Command::Stop).unwrap();
    prepare(&mut m, "EEE");
    m.time += 0.8;
    prepare(&mut m, "EEW");
    m.time += 0.8;
    let order = json!({"o":"targetItem","i":0,"item":"galeglass","id":2}).to_string();
    assert_eq!(m.order_json(0, &order), None);
    let hp = m.u(2).hp;
    m.hurt(2, 300.0, 1, true, false);
    m.attack_hit(1, 2, 100.0);
    assert_eq!(m.u(2).hp, hp);
    assert!(m.u(2).cyclone_until > m.time);
    m.step(DT, 91);
    cast(&mut m, 5, at);
    prepare(&mut m, "QWE");
    m.step(DT, 31);
    cast(&mut m, 5, at);
    m.step(DT, 16);
    cast(&mut m, 4, at);
    m.step(DT, 37);
    assert!(m.u(2).cyclone_until < m.time);
    assert!(m.u(2).pos.x > at.x + 100.0);
    assert!(m.u(2).burn.is_some());
    assert!(m.u(2).hp < hp - 500.0);
}

#[test]
fn duel_towers_leave_neutral_ground_in_the_lane() {
    let mut m = duel(["brakk", "vesper"]);
    let [left, right] = [0, 1].map(|side| m.building(side, "outer").unwrap());
    let (a, b) = (m.u(left), m.u(right));
    let neutral_space = a.pos.dist(b.pos) - a.range - b.range - 2.0 * m.u(1).r;
    assert!(neutral_space >= 700.0);
    let (x, y) = ((a.pos.x + b.pos.x) / 2.0, a.pos.y);
    let edge = a.pos.x + a.range;
    place(&mut m, 1, x - 40.0, y);
    place(&mut m, 2, x + 40.0, y);
    m.command(1, Command::Stop).unwrap();
    m.command(2, Command::Stop).unwrap();
    m.step(DT, 1);
    assert_eq!(m.u(left).target, None);
    assert_eq!(m.u(right).target, None);
    for (team, outer) in [left, right].into_iter().enumerate() {
        let inner = m.building(team, "inner").unwrap();
        let (a, b) = (m.u(outer), m.u(inner));
        let intruder = m.heroes[1 - team];
        let gap = a.pos.dist(b.pos) - a.range - b.range - 2.0 * m.u(intruder).r;
        assert!(gap >= 190.0);
        let middle = a.pos.projected(b.pos.delta(a.pos), 0.5);
        place(&mut m, intruder, middle.x, middle.y);
        m.step(DT, 1);
        assert_eq!(m.u(outer).target, None);
        assert_eq!(m.u(inner).target, None);
    }
    place(&mut m, 2, edge, y);
    m.step(DT, 1);
    assert_eq!(m.u(left).target, Some(2));
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
    let mid = [0, 1].map(|team| m.u(m.lane_building(team, 1, "outer").unwrap()));
    let neutral_space =
        mid[0].pos.dist(mid[1].pos) - mid[0].range - mid[1].range - 2.0 * m.u(m.heroes[0]).r;
    assert!(
        neutral_space >= 700.0,
        "mid lane needs room to trade outside tower range"
    );
    let hero_radius = m.u(m.heroes[0]).r;
    for team in 0..=1 {
        for lane in 0..3 {
            let a = m.u(m.lane_building(team, lane, "outer").unwrap());
            let b = m.u(m.lane_building(team, lane, "inner").unwrap());
            let gap = a.pos.dist(b.pos) - a.range - b.range - 2.0 * hero_radius;
            assert!(gap >= 190.0, "side {team}, lane {lane}: outer/inner gap");
            let middle = a.pos.projected(b.pos.delta(a.pos), 0.5);
            assert!(m.buildings.iter().all(|&id| {
                let tower = m.u(id);
                tower.kind == "core" || middle.dist(tower.pos) >= tower.range + hero_radius + 70.0
            }));
            assert!((0..=1).all(|side| middle.dist(m.home(side)) >= 490.0));
        }
    }
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
fn fortification_shares_a_team_timer_and_fires_at_distinct_creeps() {
    let mut m = Match::from_options(
        r#"{"team_match":true,"bots":[null,null,null,null,null,null,null,null,null,null]}"#,
    )
    .unwrap();
    let order = r#"{"o":"fortify"}"#;
    assert!(Match::valid_order(order));
    assert!(training("brakk", false).order_json(0, order).is_some());
    m.step(DT, 121);
    let tower = m.lane_building(0, 1, "outer").unwrap();
    let opponent = m.lane_building(1, 1, "outer").unwrap();
    let hp = m.u(tower).hp;
    assert_eq!(m.order_json(0, order), None);
    assert!(m.order_json(4, order).unwrap().contains("cooling down"));
    assert!(!m.fortified(m.u(opponent)));
    assert!(!m.fortified(m.u(m.building(0, "core").unwrap())));
    assert!(m.fortified(m.u(m.lane_building(0, 0, "outer").unwrap())));
    m.hurt(tower, 100.0, m.heroes[5], false, true);
    assert_eq!(m.u(tower).hp, hp);

    let pos = m.u(tower).pos;
    let enemies: Vec<_> = m
        .creeps
        .iter()
        .copied()
        .filter(|&id| m.u(id).team == 1)
        .collect();
    for (i, &id) in enemies.iter().take(6).enumerate() {
        place(&mut m, id, pos.x + 100.0 + i as f64 * 40.0, pos.y);
    }
    assert!(m.attack(tower, Some(enemies[0])));
    m.time += 0.2;
    m.finish_attack(tower);
    let targets: BTreeSet<_> = m
        .projectiles
        .iter()
        .filter_map(|p| match p.shot {
            Shot::Attack { target } if p.from == tower => Some(target),
            _ => None,
        })
        .collect();
    assert_eq!(targets.len(), 5);
    assert!(targets.contains(&enemies[0]));
    assert!(targets.iter().all(|id| enemies[..6].contains(id)));

    m.time = m.fortification[0].until;
    m.hurt(tower, 100.0, m.heroes[5], false, true);
    assert!(m.u(tower).hp < hp);
    assert!(m.order_json(0, order).is_some());
    assert_eq!(m.order_json(5, order), None);
    assert!(m.fortified(m.u(opponent)));
}

#[test]
fn buyback_requires_gold_and_respawns_at_the_fountain_with_a_personal_cooldown() {
    let mut m = duel(["brakk", "orrin"]);
    let order = r#"{"o":"buyback"}"#;
    assert!(Match::valid_order(order));
    assert!(m.order_json(0, order).is_some());
    m.kill(1, 2, false);
    let cost = m.h(1).buyback_cost();
    m.h_mut(1).gold = f64::from(cost - 1);
    assert!(m.order_json(0, order).unwrap().contains("gold"));
    assert_eq!(m.u(1).hp, 0.0);
    assert!(view(&m, 1)["heroes"][0]["buybackCost"].is_null());

    m.h_mut(1).gold += 1.0;
    assert_eq!(m.order_json(0, order), None);
    assert_eq!(m.h(1).gold, 0.0);
    assert_eq!(m.u(1).pos, m.home(0));
    assert_eq!(m.u(1).hp, m.u(1).max_hp);
    assert_eq!(m.h(1).mana, m.h(1).max_mana);
    assert_eq!(m.h(1).jump, 1);
    assert_eq!(view(&m, 0)["heroes"][0]["buybackReady"], 240.0);

    m.kill(1, 2, false);
    m.h_mut(1).gold = f64::from(cost);
    assert!(m.order_json(0, order).unwrap().contains("cooling down"));
    assert_eq!(m.h(1).gold, f64::from(cost));
    m.time = m.h(1).buyback_ready;
    assert_eq!(m.order_json(0, order), None);
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
fn veyra_detonates_all_three_brands_and_ends_at_the_one_nearest_the_click() {
    let mut m = duel(["veyra", "brakk"]);
    m.h_mut(1).level = 6;
    m.refresh(1);
    m.h_mut(1).mana = m.h(1).max_mana;
    m.time = 1.0;
    place(&mut m, 1, 2000.0, 450.0);
    let mana = m.h(1).mana;
    for x in [2130.0, 2350.0, 2600.0] {
        cast(&mut m, 3, Point::new(x, 450.0));
    }
    assert_eq!(m.h(1).mana, mana - 225.0);
    assert_eq!(
        view(&m, 0)["heroes"][0]["brands"].as_array().unwrap().len(),
        3
    );
    assert!(
        m.command(1, Command::cast(3, Point::new(2800.0, 450.0), None))
            .unwrap_err()
            .contains("charges")
    );

    let remote_click = r#"{"o":"cast","i":4,"x":2380,"y":820,"castMode":"point"}"#;
    assert!(Match::valid_order(remote_click));
    assert_eq!(m.order_json(0, remote_click), None);
    assert_eq!(m.h(1).mana, mana - 225.0);
    assert_eq!(m.u(1).dash.unwrap().pos, Point::new(2130.0, 450.0));
    m.step(DT, 8);
    assert_eq!(m.h(1).live_brands(m.time).count(), 2);
    m.step(DT, 32);
    assert_eq!(m.u(1).pos, Point::new(2350.0, 450.0));
    assert_eq!(m.h(1).live_brands(m.time).count(), 0);
    let explosions: Vec<_> = m
        .effects
        .iter()
        .filter(|e| e["kind"] == "burst" && e["ability"] == "Return to Brand")
        .map(|e| e["x"].as_f64().unwrap())
        .collect();
    assert_eq!(explosions, [2130.0, 2600.0, 2350.0]);
    assert!(
        m.command(1, Command::cast(3, Point::default(), None))
            .is_err()
    );

    m.time = 13.0;
    assert!(m.order_json(0, remote_click).unwrap().contains("first"));
    m.time = 19.0;
    cast(&mut m, 3, Point::new(2800.0, 450.0));
    assert_eq!(m.h(1).live_brands(m.time).count(), 1);
    m.time = 31.0;
    assert!(m.order_json(0, remote_click).unwrap().contains("first"));
    m.time = 37.0;
    cast(&mut m, 3, Point::new(2750.0, 450.0));
    m.kill(1, 2, false);
    assert_eq!(m.h(1).live_brands(m.time).count(), 0);
}

#[test]
fn veyra_snare_roots_two_nearby_targets_and_ticks_without_stunning() {
    let mut m = duel(["veyra", "brakk"]);
    let origin = Point::new(2000.0, 450.0);
    let enemy = Point::new(2150.0, 450.0);
    place(&mut m, 1, origin.x, origin.y);
    place(&mut m, 2, enemy.x, enemy.y);
    let nearby = m.insert(Unit {
        team: 1,
        pos: Point::new(1920.0, 500.0),
        hp: 400.0,
        ..Unit::default()
    });
    let distant = m.insert(Unit {
        team: 1,
        pos: Point::new(2600.0, 450.0),
        hp: 400.0,
        ..Unit::default()
    });
    let hp = m.u(2).hp;
    cast(&mut m, 0, Point::default());
    assert!(m.u(2).root_until > m.time && m.u(nearby).root_until > m.time);
    assert_eq!(m.u(distant).root_until, 0.0);
    assert_eq!(m.u(2).stun_until, 0.0);
    assert_eq!(m.u(2).hp, hp);
    m.command(2, Command::Move(Point::new(2350.0, 450.0)))
        .unwrap();
    m.step(DT, 31);
    assert_eq!(m.u(2).pos, enemy);
    assert!(m.u(2).hp < hp);
    m.step(DT, 65);
    assert!(m.u(2).pos.x > enemy.x);
}

#[test]
fn veyra_attacks_every_sweep_target_can_snare_mid_sweep_and_returns() {
    let mut m = training("veyra", true);
    let target = m.u(2).pos;
    let start = Point::new(target.x - 440.0, target.y);
    place(&mut m, 1, start.x, start.y);
    m.command(1, Command::Buy("frost".into())).unwrap();
    for (i, dx) in [-145.0, -85.0, 85.0, 145.0, 180.0].into_iter().enumerate() {
        m.insert(Unit {
            team: 1,
            pos: Point::new(target.x + dx, target.y + 45.0 + 14.0 * i as f64),
            role: Role::Creep,
            kind: "melee",
            hp: 1000.0,
            max_hp: 1000.0,
            r: 12.0,
            ..Unit::default()
        });
    }
    cast(&mut m, 1, target);
    m.step(DT, 5);
    assert_ne!(m.u(1).pos, start);
    assert_eq!(m.u(1).sweep_origin, Some(start));
    assert!(m.u(2).slows.iter().any(|slow| slow.id == "frost"));
    let hp = m.u(1).hp;
    m.hurt(1, 100.0, 2, true, false);
    assert_eq!(m.u(1).hp, hp);
    cast(&mut m, 0, Point::default());
    assert_eq!(
        m.effects.iter().filter(|e| e["kind"] == "chains").count(),
        2
    );
    m.step(DT, 69);
    assert_eq!(m.effects.iter().filter(|e| e["kind"] == "sweep").count(), 6);
    assert_eq!(m.u(1).pos, start);
    assert!(m.u(1).sweep_origin.is_none());

    cast(&mut m, 2, Point::default());
    assert_eq!(m.h(1).spell_barrier.as_ref().unwrap().health, 220.0);
    m.step(DT, 25);
    let hits = m.training.as_ref().unwrap().hits;
    place(&mut m, 1, target.x - 95.0, target.y);
    m.step(DT, 50);
    assert_eq!(m.training.as_ref().unwrap().hits, hits + 1);
}

#[test]
fn grapnel_hits_the_first_unit_and_reels_to_its_launch_point() {
    let mut m = duel(["morrow", "brakk"]);
    place(&mut m, 1, 2000.0, 450.0);
    place(&mut m, 2, 2580.0, 450.0);
    m.command(1, Command::Stop).unwrap();
    m.command(2, Command::Stop).unwrap();
    let ally = m.insert(Unit {
        team: 0,
        role: Role::Creep,
        kind: "melee",
        r: 15.0,
        hp: 400.0,
        max_hp: 400.0,
        pos: Point::new(2270.0, 450.0),
        ..Unit::default()
    });
    m.creeps.push(ally);
    let enemy_hp = m.u(2).hp;
    cast(&mut m, 0, Point::new(2800.0, 450.0));
    m.step(DT, 36);
    assert_eq!(m.u(ally).hp, 400.0);
    assert!((m.u(ally).pos.x - 2076.0).abs() < 1.0);
    assert_eq!(m.u(2).hp, enemy_hp);
    assert_eq!(m.u(2).pos.x, 2580.0);

    m.u_mut(ally).hp = 0.0;
    m.time = m.h(1).cd[0];
    cast(&mut m, 0, Point::new(2800.0, 450.0));
    place(&mut m, 1, 2000.0, 600.0);
    m.step(DT, 60);
    assert!(m.u(2).hp < enemy_hp);
    assert!((m.u(2).pos.x - 2076.0).abs() < 1.0);
    assert_eq!(m.u(2).pos.y, 450.0);

    let mut training = training("morrow", true);
    let anchor = training.u(1).pos;
    let dummy = training.u(2).pos;
    cast(&mut training, 0, dummy);
    training.step(DT, 60);
    assert_eq!(training.u(2).pos, Point::new(anchor.x + 76.0, anchor.y));
    assert_eq!(training.training.as_ref().unwrap().hits, 1);
}

#[test]
fn glass_shard_tracks_its_selected_enemy_and_knife_rush_accepts_allies() {
    let mut m = duel(["calyx", "brakk"]);
    m.h_mut(1).level = 6;
    m.refresh(1);
    m.command(1, Command::Stop).unwrap();
    m.command(2, Command::Stop).unwrap();
    place(&mut m, 1, 2200.0, 450.0);
    place(&mut m, 2, 2700.0, 450.0);
    let ally = m.insert(Unit {
        team: 0,
        role: Role::Creep,
        kind: "melee",
        r: 15.0,
        hp: 400.0,
        max_hp: 400.0,
        pos: Point::new(2450.0, 450.0),
        ..Unit::default()
    });
    assert!(
        m.command(1, Command::cast(0, Point::default(), Some(ally)))
            .is_err()
    );
    assert!(
        m.command(1, Command::cast(1, Point::default(), Some(1)))
            .is_err()
    );
    assert_eq!(m.h(1).cd[0..2], [0.0, 0.0]);

    let enemy_hp = m.u(2).hp;
    m.command(1, Command::cast(0, Point::default(), Some(2)))
        .unwrap();
    assert_eq!(view(&m, 0)["projectiles"][0][9], "dagger");
    m.step(DT, 10);
    assert_eq!(m.u(2).hp, enemy_hp);
    place(&mut m, 2, 2680.0, 630.0);
    m.step(DT, 32);
    assert!(m.u(2).hp < enemy_hp);
    assert!(m.u(2).slows.iter().any(|slow| slow.id == "glassShard"));
    assert_eq!(m.u(ally).hp, 400.0);
    assert_eq!(m.h(1).finisher_hits(m.time), Some(0));

    m.command(1, Command::cast(1, Point::default(), Some(2)))
        .unwrap();
    assert!(m.u(1).reach(m.u(2)) < 80.0);
    assert!(matches!(m.h(1).order, Order::Attack(2)));
    m.refresh_if_changed(1);
    let expected_haste = 2.25 + m.h(1).kit().speed_growth * 5.0;
    assert!((stat(&m.h(1).stats, "haste") - expected_haste).abs() < 1e-9);
    m.time = m.h(1).cd[1];
    m.u_mut(1).root_until = m.time + 1.0;
    assert!(
        m.command(1, Command::cast(1, Point::default(), Some(ally)))
            .is_err()
    );
    m.u_mut(1).root_until = 0.0;
    m.command(1, Command::cast(1, Point::default(), Some(ally)))
        .unwrap();
    assert!(m.u(1).reach(m.u(ally)) < 80.0);
    assert!(matches!(m.h(1).order, Order::Stop));
}

#[test]
fn fault_cut_resets_when_its_chain_expires_and_overrides_item_crits() {
    let mut m = training("calyx", true);
    let raw = m.h(1).attack_damage();
    let armor = physical(m.u(2).armor);
    for hits in 1..=3 {
        m.attack_hit(1, 2, raw);
        assert_eq!(view(&m, 0)["heroes"][0]["finisherHits"], hits);
    }
    m.time += 5.0;
    assert_eq!(m.h(1).finisher_hits(m.time), Some(0));
    for _ in 0..3 {
        m.attack_hit(1, 2, raw);
    }
    m.attack_hit(1, 2, raw * 1.8);
    assert!((m.training.as_ref().unwrap().last_hit - raw * 2.8 * armor).abs() < 1e-8);
    assert_eq!(m.h(1).finisher_hits(m.time), Some(0));
    assert!(
        view(&m, 0)["effects"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["kind"] == "finisher")
    );
}

#[test]
fn spirit_selection_orders_only_move_units_owned_by_the_issuing_player() {
    let mut m = duel(["neris", "brakk"]);
    place(&mut m, 1, 2000.0, 450.0);
    m.command(1, Command::Stop).unwrap();
    prepare(&mut m, "EEQ");
    cast(&mut m, 4, Point::new(2180.0, 450.0));
    let spirits = m.creeps.clone();
    assert_eq!(spirits.len(), 2);
    for (row, id) in view(&m, 0)["creeps"]
        .as_array()
        .unwrap()
        .iter()
        .zip(&spirits)
    {
        assert_eq!(row[0], *id);
        assert_eq!(row[11], 1);
    }
    let order = json!({"o":"group","ids":spirits,"action":"move","x":2450,"y":450}).to_string();
    assert!(Match::valid_order(&order));
    assert!(m.order_json(1, &order).unwrap().contains("control"));
    assert_eq!(m.order_json(0, &order), None);
    m.step(DT, 65);
    assert_eq!(m.u(1).pos, Point::new(2000.0, 450.0));
    for id in spirits {
        assert!(m.u(id).pos.x > 2440.0);
    }
}

#[test]
fn ion_beacon_waits_for_enemy_contact_after_arming() {
    for enemy_is_hero in [false, true] {
        let mut m = training("kestrel", enemy_is_hero);
        let at = m.u(1).pos;
        let ally = m.insert(Unit {
            team: 0,
            role: Role::Creep,
            hp: 500.0,
            max_hp: 500.0,
            r: 15.0,
            pos: Point::new(at.x - 60.0, at.y),
            ..Unit::default()
        });
        let enemy = if enemy_is_hero {
            2
        } else {
            m.insert(Unit {
                team: 1,
                role: Role::Creep,
                hp: 500.0,
                max_hp: 500.0,
                r: 15.0,
                ..Unit::default()
            })
        };
        place(&mut m, enemy, at.x + 65.0, at.y);
        cast(&mut m, 0, Point::default());
        m.step(DT, 32);
        assert_eq!(m.areas.len(), 1);
        place(&mut m, enemy, at.x + 125.0, at.y);
        m.step(DT, 18);
        assert_eq!(
            m.areas.len(),
            1,
            "an ally or an enemy outside the trigger cannot set it off"
        );

        let hp = m.u(enemy).hp;
        place(&mut m, enemy, at.x + 65.0, at.y);
        m.step(DT, 1);
        assert!(m.areas.is_empty());
        assert_eq!(m.u(ally).hp, 500.0);
        if enemy_is_hero {
            assert_eq!(m.training.as_ref().unwrap().hits, 1);
        } else {
            assert!(m.u(enemy).hp < hp);
        }
        assert!(!m.u(enemy).slows.is_empty());
    }
}

#[test]
fn kestrel_reels_a_nearby_hero_and_splashes_the_charged_attack() {
    let mut m = duel(["kestrel", "brakk"]);
    m.next_wave = f64::INFINITY;
    m.command(1, Command::Stop).unwrap();
    m.command(2, Command::Stop).unwrap();
    m.h_mut(1).level = 6;
    m.refresh(1);
    m.h_mut(1).mana = m.h(1).max_mana;
    place(&mut m, 1, 2000.0, 450.0);
    place(&mut m, 2, 2400.0, 450.0);
    assert!(
        m.command(1, Command::cast(2, Point::default(), None))
            .unwrap_err()
            .contains("passive")
    );
    assert!(
        m.command(1, Command::cast(1, Point::default(), Some(2)))
            .is_err()
    );
    place(&mut m, 2, 2320.0, 450.0);
    m.command(1, Command::cast(1, Point::default(), Some(2)))
        .unwrap();
    assert_eq!(m.u(2).pos, Point::new(2320.0, 450.0));
    m.step(DT, 15);
    assert!((2165.0..2320.0).contains(&m.u(2).pos.x));
    m.step(DT, 24);
    assert!(
        (m.u(2).pos.x - 2165.0).abs() < 1e-6,
        "pull ended at {:?}",
        m.u(2).pos
    );
    assert_eq!(view(&m, 0)["heroes"][0]["charged"], true);

    let neighbor = m.insert(Unit {
        role: Role::Creep,
        team: 1,
        pos: Point::new(2165.0, 580.0),
        r: 15.0,
        hp: 300.0,
        max_hp: 300.0,
        ..Unit::default()
    });
    m.attack_hit(1, 2, 30.0);
    assert!(m.u(neighbor).hp < 300.0);
    assert!(view(&m, 0)["heroes"][0]["charged"].is_null());
    assert_eq!(
        m.effects
            .iter()
            .filter(|e| e["ability"] == "Live Circuit")
            .count(),
        1
    );
    m.attack_hit(1, 2, 30.0);
    assert_eq!(
        m.effects
            .iter()
            .filter(|e| e["ability"] == "Live Circuit")
            .count(),
        1
    );
}

#[test]
fn current_run_spends_max_mana_shields_and_hits_in_flight_then_scales_landing() {
    let mut m = duel(["kestrel", "brakk"]);
    m.next_wave = f64::INFINITY;
    m.command(1, Command::Stop).unwrap();
    m.command(2, Command::Stop).unwrap();
    m.h_mut(1).level = 6;
    m.refresh(1);
    place(&mut m, 1, 2100.0, 450.0);
    place(&mut m, 2, 2400.0, 450.0);
    let max_mana = m.h(1).max_mana;
    let base = 25.0 + 0.075 * max_mana;
    let per_unit = 0.1 + 0.000065 * max_mana;
    m.h_mut(1).mana = base - 1.0;
    assert!(
        m.command(1, Command::cast(3, Point::new(3350.0, 450.0), None))
            .unwrap_err()
            .contains("mana")
    );
    assert!(m.u(1).dash.is_none());
    m.h_mut(1).mana = max_mana;
    let traveler_hp = m.u(1).hp;
    let enemy_hp = m.u(2).hp;
    cast(&mut m, 3, Point::new(2500.0, 450.0));
    assert!((m.h(1).mana - (max_mana - base - 400.0 * per_unit)).abs() < 1e-8);
    m.hurt(1, 100.0, 2, false, false);
    assert_eq!(m.u(1).hp, traveler_hp);
    m.step(DT, 10);
    assert!(m.u(1).dash.is_some());
    assert!((enemy_hp - m.u(2).hp - 18.0).abs() < 2.0);
    m.step(DT, 4);
    assert!(m.u(1).dash.is_none());
    assert!(enemy_hp - m.u(2).hp > 80.0);
    assert!(m.h(1).ready_at(3) <= m.time);
    m.h_mut(1).mana = base + 200.0 * per_unit;
    cast(&mut m, 3, Point::new(4000.0, 450.0));
    assert!(
        (m.u(1).dash.unwrap().pos.x - 2700.0).abs() < 1e-6,
        "started at {:?} and aimed at {:?}",
        m.u(1).pos,
        m.u(1).dash.unwrap().pos
    );
    assert!(m.h(1).mana < 1e-7);
}

#[test]
fn hushthorn_silences_and_echoes_damage_and_the_aegis_clears_it() {
    let mut m = duel(["kestrel", "brakk"]);
    m.next_wave = f64::INFINITY;
    m.h_mut(1).gold = 10_000.0;
    m.h_mut(2).gold = 10_000.0;
    m.buy(1, "hushthorn").unwrap();
    m.buy(2, "sovereign").unwrap();
    place(&mut m, 1, 2300.0, 450.0);
    place(&mut m, 2, 2490.0, 450.0);
    let use_hushthorn = r#"{"o":"targetItem","i":0,"item":"hushthorn","id":2}"#;
    assert!(m.order_json(0, use_hushthorn).is_none());
    assert!(
        m.command(2, Command::cast(1, Point::default(), None))
            .unwrap_err()
            .contains("silenced")
    );
    m.hurt(2, 100.0, 1, true, false);
    let before = m.u(2).hp;
    m.time += 4.0;
    m.step(DT, 1);
    assert!((before - m.u(2).hp - 14.0625).abs() < 0.5);
    assert!(!m.u(2).silenced(m.time));

    m.time += 25.0;
    assert!(m.order_json(0, use_hushthorn).is_none());
    m.slow(2, "test", 0.4, 1.0);
    m.command(2, Command::Item(0, Point::default())).unwrap();
    assert!(!m.u(2).silenced(m.time));
    assert!(m.u(2).slows.is_empty());
    let before = m.u(2).hp;
    m.magic(2, 1, &m.h(1).kit().abilities[1], 100.0, None);
    assert!((before - m.u(2).hp - 41.25).abs() < 1e-6);
    assert!(m.u(2).hook_pull.is_none());
    assert!(m.u(2).stun_until <= m.time);
}

#[test]
fn fountain_lingers_and_towers_outrange_heroes_on_both_maps() {
    for team_match in [false, true] {
        let mut m = Match::from_options(&json!({"team_match":team_match,"bots":[null,null,null,null,null,null,null,null,null,null]}).to_string()).unwrap();
        m.next_wave = f64::INFINITY;
        let home = m.home(0);
        m.u_mut(1).hp = 100.0;
        m.h_mut(1).mana = 10.0;
        m.step(DT, 1);
        place(&mut m, 1, home.x + 420.0, home.y);
        let before = m.u(1).hp;
        let mana = m.h(1).mana;
        m.step(DT, 25);
        assert!(m.u(1).hp > before + 20.0 && m.h(1).mana > mana + 10.0);
        m.step(DT, 38);
        let after = m.u(1).hp;
        m.step(DT, 1);
        assert!(m.u(1).hp - after < 1.0);
        for &tower in &m.buildings {
            let b = m.u(tower);
            if matches!(b.kind, "inner" | "outer") {
                assert!(
                    rules()
                        .heroes
                        .values()
                        .all(|h| h.range + b.r < b.range + m.u(1).r)
                );
            }
        }
    }
    let mut m = duel(["vesper", "brakk"]);
    m.gain_xp(1, 100_000.0);
    assert_eq!(m.h(1).level, 20);
    assert_eq!(m.h(1).xp, 0.0);
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
        let target = (kit.abilities[0].cast_mode() == "unit").then_some(2);
        if target.is_some() {
            place(&mut m, 2, point.x, point.y);
        }
        m.command(1, Command::cast(0, point, target)).unwrap();
        assert_eq!(m.h(1).mana, m.h(1).max_mana - kit.abilities[0].mana);
        m.step(DT, 60);
        assert!(
            m.command(1, Command::cast(0, point, target))
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
fn training_cooldowns_can_be_enabled_and_reset_with_renewal_orb() {
    let use_cooldowns = r#"{"o":"trainingCooldowns","disabled":false}"#;
    let zero_cooldowns = r#"{"o":"trainingCooldowns","disabled":true}"#;
    assert!(!Match::valid_order(use_cooldowns));
    assert!(
        duel(["neris", "brakk"])
            .order_json(0, use_cooldowns)
            .is_some()
    );

    let mut m = training("neris", true);
    assert_eq!(view(&m, 0)["training"]["noCooldowns"], true);
    m.command(1, Command::Buy("renewal".into())).unwrap();
    m.command(1, Command::Buy("locket".into())).unwrap();
    prepare(&mut m, "QQE");
    prepare(&mut m, "QQW");
    assert_eq!(m.order_json(0, use_cooldowns), None);
    assert_eq!(view(&m, 0)["training"]["noCooldowns"], false);

    let mana = m.h(1).mana;
    cast(&mut m, 4, Point::default());
    cast(&mut m, 5, Point::default());
    m.command(1, Command::Item(1, Point::default())).unwrap();
    m.step(DT, 1);
    assert_eq!(m.h(1).mana, mana);
    assert!(m.h(1).ready_at(5) > m.time);
    assert!(
        m.command(1, Command::cast(4, Point::default(), None))
            .is_err()
    );
    assert!(m.command(1, Command::Item(1, Point::default())).is_err());
    prepare(&mut m, "QWW");
    assert!(m.h(1).ready_at(3) > m.time);

    m.command(1, Command::Item(0, Point::default())).unwrap();
    assert_eq!(m.h(1).ready_at(3), 0.0);
    assert!(m.h(1).weave_ready.is_empty());
    assert!(m.h(1).items_ready["renewal"] > m.time);
    assert!(m.command(1, Command::Item(0, Point::default())).is_err());
    m.command(1, Command::Item(1, Point::default())).unwrap();
    cast(&mut m, 5, Point::default());

    m.command(1, Command::TrainingHero("vesper".into()))
        .unwrap();
    assert!(m.command(1, Command::Item(0, Point::default())).is_err());
    assert_eq!(m.order_json(0, zero_cooldowns), None);
    m.command(1, Command::Item(0, Point::default())).unwrap();
    m.command(1, Command::Item(0, Point::default())).unwrap();
    assert!(m.h(1).items_ready.is_empty());
}

#[test]
fn veil_expires_in_duels_and_training() {
    for mut m in [duel(["neris", "brakk"]), training("neris", true)] {
        prepare(&mut m, "QQW");
        cast(&mut m, 4, Point::default());

        let expires = m.time + 5.5;
        assert_eq!(view(&m, 0)["heroes"][0]["veilUntil"], expires);
        assert!(view(&m, 1)["heroes"][0]["veilUntil"].is_null());

        m.step(DT, 329);
        assert_eq!(view(&m, 0)["heroes"][0]["veilUntil"], expires);
        assert_eq!(view(&m, 1)["heroes"][0]["concealed"], true);

        m.step(DT, 2);
        assert!(!m.u(1).veiled(m.time));
        assert!(view(&m, 0)["heroes"][0]["veilUntil"].is_null());
        assert!(view(&m, 1)["heroes"][0]["x"].is_number());
    }
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
    assert!(m.u(2).lift_until <= m.time);
    m.step(DT, 4);
    assert!(m.u(2).lift_until > m.time);
    assert!(m.u(2).burn.is_some());
    assert_eq!(m.u(2).pos, dummy);
    prepare(&mut m, "QWE");
    cast(&mut m, 4, dummy);
    m.step(DT, 36);
    assert!(m.u(2).disarmed_until > m.time);
    m.step(DT, 120);
    assert!(m.training.as_ref().unwrap().hits >= 7);
    assert_eq!(m.u(2).hp, hp);
    assert_eq!(m.u(2).pos, Point::new(dummy.x + 145.0, dummy.y));
    assert_eq!(m.h(1).mana, mana);
    assert!(m.h(1).weave_ready.is_empty());
}

#[test]
fn cairn_casts_three_ranges_along_facing_and_training_restores_heat() {
    let mut m = training("cairn", false);
    let start = m.u(1).pos;
    for (slot, offset) in [200.0, 450.0, 700.0].into_iter().enumerate() {
        cast(&mut m, slot, Point::new(start.x - 500.0, start.y - 90.0));
        assert_eq!(m.areas[slot].pos.x, start.x + offset);
        assert_eq!(m.areas[slot].pos.y, start.y);
        assert_eq!(m.areas[slot].spell.radius, 250.0);
    }
    cast(&mut m, 3, start);
    assert_eq!(m.h(1).heat, 6);
    m.step(DT, 99);
    assert_eq!(m.h(1).heat, 0);
    m.step(DT, 1);
    assert_eq!(m.h(1).heat, 6);
    assert_eq!(m.training.as_ref().unwrap().hits, 0);
}

#[test]
fn cairn_blasts_overlap_and_hit_near_the_far_edge() {
    let mut m = training("cairn", true);
    let start = m.u(1).pos;
    place(&mut m, 2, start.x + 440.0, start.y);
    cast(&mut m, 0, start);
    cast(&mut m, 1, start);
    m.step(DT, 24);
    assert_eq!(m.training.as_ref().unwrap().hits, 2);

    place(&mut m, 2, start.x + 945.0, start.y);
    cast(&mut m, 2, start);
    m.step(DT, 25);
    assert_eq!(m.training.as_ref().unwrap().hits, 3);

    place(&mut m, 2, start.x + 970.0, start.y);
    cast(&mut m, 2, start);
    m.step(DT, 25);
    assert_eq!(m.training.as_ref().unwrap().hits, 3);
}

#[test]
fn furnace_vent_requires_a_full_channel_and_commits_resources_on_release() {
    let mut m = duel(["cairn", "brakk"]);
    m.h_mut(1).level = 6;
    m.refresh(1);
    m.h_mut(1).mana = m.h(1).max_mana;
    m.h_mut(1).heat = 3;
    let at = Point::new(2200.0, 450.0);
    place(&mut m, 1, at.x, at.y);
    place(&mut m, 2, at.x + 160.0, at.y);
    let mana = m.h(1).mana;

    cast(&mut m, 3, at);
    assert_eq!(view(&m, 0)["heroes"][0]["castChannel"][2], 1.65);
    assert_eq!(m.h(1).mana, mana);
    assert_eq!(m.h(1).heat, 3);
    for cmd in [
        Command::Move(Point::new(2400.0, 450.0)),
        Command::Attack(2),
        Command::cast(0, at, None),
        Command::Recall,
        Command::Item(0, at),
    ] {
        assert!(m.command(1, cmd).unwrap_err().contains("Channeling"));
    }
    m.command(1, Command::Stop).unwrap();
    assert!(m.h(1).cast_channel.is_none());

    cast(&mut m, 3, at);
    m.step(DT, 30);
    m.magic(
        1,
        2,
        &Spell {
            stun: 0.25,
            ..Spell::default()
        },
        0.0,
        None,
    );
    m.step(DT, 20);
    assert!(m.h(1).cast_channel.is_none());
    assert_eq!(m.h(1).cd[3], 0.0);
    assert_eq!(m.h(1).mana, mana);
    assert_eq!(m.h(1).heat, 3);
    assert!(
        !m.effects
            .iter()
            .any(|e| e["kind"] == "burst" && e["ability"] == "Furnace Vent")
    );

    cast(&mut m, 3, at);
    m.step(DT, 98);
    assert_eq!(m.u(1).pos, at);
    assert!(m.h(1).cast_channel.is_some());
    m.step(DT, 1);
    assert_eq!(m.h(1).mana, mana - 145.0);
    assert_eq!(m.h(1).heat, 0);
    assert!(m.h(1).cd[3] > m.time);
    assert!(
        m.effects
            .iter()
            .any(|e| e["kind"] == "burst" && e["ability"] == "Furnace Vent")
    );
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
