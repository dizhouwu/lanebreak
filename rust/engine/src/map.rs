use super::*;

impl Match {
    pub(super) fn height(&self) -> f64 {
        if self.team_match {
            rules().team_map.height
        } else {
            rules().height
        }
    }

    pub(super) fn home(&self, team: usize) -> Point {
        if self.team_match {
            let [x, y] = rules().team_map.fountains[team];
            return Point::new(x, y);
        }
        Point::new([110.0, rules().width - 110.0][team], 450.0)
    }

    pub(super) fn spawn_point(&self, team: usize, slot: usize) -> Point {
        let home = self.home(team);
        if !self.team_match {
            return home;
        }
        let direction = if team == 0 { 1.0 } else { -1.0 };
        home.projected(Point::new(direction, 0.0), 64.0 * (slot as f64 - 2.0))
    }

    pub(super) fn lane_point(&self, team: usize, lane: usize, mut distance: f64) -> Point {
        let path = &rules().team_map.lanes[lane];
        let point = |i| {
            let [x, y] = path[if team == 0 { i } else { path.len() - 1 - i }];
            Point::new(x, y)
        };
        for i in 0..path.len() - 1 {
            let a = point(i);
            let b = point(i + 1);
            let span = a.dist(b);
            if distance <= span {
                return a.projected(b.delta(a), distance / span);
            }
            distance -= span;
        }
        point(path.len() - 1)
    }

    pub(super) fn lane_progress(&self, team: usize, lane: usize, pos: Point) -> f64 {
        let path = &rules().team_map.lanes[lane];
        let mut traveled = 0.0;
        let mut closest = f64::INFINITY;
        let mut progress = 0.0;
        for pair in path.windows(2) {
            let a = Point::new(pair[0][0], pair[0][1]);
            let b = Point::new(pair[1][0], pair[1][1]);
            let delta = b.delta(a);
            let offset = pos.delta(a);
            let length = a.dist(b);
            let fraction =
                ((offset.x * delta.x + offset.y * delta.y) / (length * length)).clamp(0.0, 1.0);
            let distance = pos.squared(a.projected(delta, fraction));
            if distance < closest {
                closest = distance;
                progress = traveled + length * fraction;
            }
            traveled += length;
        }
        if team == 0 {
            progress
        } else {
            traveled - progress
        }
    }

    pub(super) fn lane_building(&self, team: usize, lane: usize, kind: &str) -> Option<Id> {
        self.buildings.iter().copied().find(|&id| {
            let b = self.u(id);
            b.team == team && b.kind == kind && b.lane == lane
        })
    }

    pub(super) fn create_team_buildings(&mut self) {
        for team in 0..=1 {
            let core = self.insert(Unit {
                role: Role::Building,
                kind: "core",
                team,
                pos: self.lane_point(team, 1, 0.0),
                r: 78.0,
                hp: 4800.0,
                max_hp: 4800.0,
                armor: 14.0,
                ..Unit::default()
            });
            self.buildings.push(core);
            for (lane, [outer, inner]) in rules().team_map.tower_distances.into_iter().enumerate() {
                for (kind, distance, hp) in [("outer", outer, 1800.0), ("inner", inner, 2100.0)] {
                    let id = self.insert(Unit {
                        role: Role::Building,
                        kind,
                        team,
                        lane,
                        pos: self.lane_point(team, lane, distance),
                        r: 44.0,
                        hp,
                        max_hp: hp,
                        armor: 12.0,
                        damage: 130.0,
                        range: 540.0,
                        interval: 0.9,
                        ..Unit::default()
                    });
                    self.buildings.push(id);
                }
            }
        }
    }
}
