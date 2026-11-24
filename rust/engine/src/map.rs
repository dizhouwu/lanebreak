use super::*;
use std::sync::OnceLock;

struct LaneSegment {
    start: Point,
    delta: Point,
    length: f64,
    traveled: f64,
}

struct LanePath {
    segments: Vec<LaneSegment>,
    end: Point,
    length: f64,
}

impl LanePath {
    fn new(points: impl Iterator<Item = Point>) -> Self {
        let mut points = points;
        let mut start = points.next().expect("lane start");
        let mut traveled = 0.0;
        let segments = points
            .map(|end| {
                let length = start.dist(end);
                let segment = LaneSegment {
                    start,
                    delta: end.delta(start),
                    length,
                    traveled,
                };
                traveled += length;
                start = end;
                segment
            })
            .collect();
        Self {
            segments,
            end: start,
            length: traveled,
        }
    }
}

fn lane_paths() -> &'static [[LanePath; 2]] {
    static PATHS: OnceLock<Vec<[LanePath; 2]>> = OnceLock::new();
    PATHS.get_or_init(|| {
        rules()
            .team_map
            .lanes
            .iter()
            .map(|path| {
                let points = path.iter().map(|&[x, y]| Point::new(x, y));
                [LanePath::new(points.clone()), LanePath::new(points.rev())]
            })
            .collect()
    })
}

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
        let path = &lane_paths()[lane][team];
        for segment in &path.segments {
            if distance <= segment.length {
                return segment
                    .start
                    .projected(segment.delta, distance / segment.length);
            }
            distance -= segment.length;
        }
        path.end
    }

    pub(super) fn lane_progress(&self, team: usize, lane: usize, pos: Point) -> f64 {
        let path = &lane_paths()[lane][0];
        let mut closest = f64::INFINITY;
        let mut progress = 0.0;
        for &LaneSegment {
            start,
            delta,
            length,
            traveled,
        } in &path.segments
        {
            let offset = pos.delta(start);
            let fraction =
                ((offset.x * delta.x + offset.y * delta.y) / (length * length)).clamp(0.0, 1.0);
            let distance = pos.squared(start.projected(delta, fraction));
            if distance < closest {
                closest = distance;
                progress = traveled + length * fraction;
            }
        }
        if team == 0 {
            progress
        } else {
            path.length - progress
        }
    }

    pub(super) fn lane_building(&self, team: usize, lane: usize, kind: &str) -> Option<Id> {
        self.buildings.iter().copied().find(|&id| {
            let b = self.u(id);
            b.team == team && b.kind == kind && b.lane == lane
        })
    }

    pub(super) fn create_team_buildings(&mut self) {
        let map = &rules().team_map;
        let [outer_range, inner_range] = map.tower_ranges;
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
            for (lane, [outer, inner]) in map.tower_distances.into_iter().enumerate() {
                for (kind, distance, hp, range) in [
                    ("outer", outer, 1800.0, outer_range),
                    ("inner", inner, 2100.0, inner_range),
                ] {
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
                        range,
                        interval: 0.9,
                        ..Unit::default()
                    });
                    self.buildings.push(id);
                }
            }
        }
    }
}
