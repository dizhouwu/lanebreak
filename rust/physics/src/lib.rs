pub const UNIT_STRIDE: usize = 5;
pub const TARGET_STRIDE: usize = 4;
const MOVABLE: u32 = 1;
const VEILED: u32 = 2;

// Unit rows hold x, y, radius, team, and flags. Resolve pairs in spawn order:
// a nudge from one pair affects the next pair in the same tick.
pub fn separate_units(units: &mut [f64], width: f64) {
    separate_units_in_map(units, width, 1000.0);
}

pub fn separate_units_in_map(units: &mut [f64], width: f64, height: f64) {
    for i in (0..units.len()).step_by(UNIT_STRIDE) {
        let (first, rest) = units.split_at_mut(i + UNIT_STRIDE);
        let a = &mut first[i..];
        for b in rest.chunks_exact_mut(UNIT_STRIDE) {
            separate_pair(a, b, width, height);
        }
    }
}

fn separate_pair(a: &mut [f64], b: &mut [f64], width: f64, height: f64) -> bool {
    let required = a[2] + b[2];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    if dx.abs() >= required || dy.abs() >= required {
        return false;
    }
    let a_flags = a[4] as u32;
    let b_flags = b[4] as u32;
    if a[3] != b[3] && ((a_flags | b_flags) & VEILED) != 0 {
        return false;
    }
    let a_moves = (a_flags & MOVABLE) != 0;
    let b_moves = (b_flags & MOVABLE) != 0;
    if !a_moves && !b_moves {
        return false;
    }
    // Match the scaled hypot used by the browser engine.
    let max = dx.abs().max(dy.abs());
    let distance = if max == 0.0 {
        0.0
    } else {
        let x = dx / max;
        let y = dy / max;
        (x * x + y * y).sqrt() * max
    };
    if distance >= required {
        return false;
    }
    let push = (required - distance) * if a_moves && b_moves { 0.35 } else { 1.0 };
    let (px, py) = if distance > 0.01 {
        (dx / distance * push, dy / distance * push)
    } else {
        (push, 0.0)
    };
    if a_moves {
        a[0] = (a[0] - px).clamp(30.0, width - 30.0);
        a[1] = (a[1] - py).clamp(70.0, height - 140.0);
    }
    if b_moves {
        b[0] = (b[0] + px).clamp(30.0, width - 30.0);
        b[1] = (b[1] + py).clamp(70.0, height - 140.0);
    }
    true
}

#[derive(Default)]
pub struct CollisionSweep {
    stripes: Vec<u64>,
    occupancy: Vec<usize>,
}

impl CollisionSweep {
    pub fn separate(&mut self, units: &mut [f64], width: f64, height: f64) {
        const STRIPE_WIDTH: f64 = 128.0;
        let count = units.len() / UNIT_STRIDE;
        if count < 128 {
            separate_units_in_map(units, width, height);
            return;
        }
        let stripes = 1 + (width / STRIPE_WIDTH) as usize;
        let words = count.div_ceil(64);
        self.stripes.resize(stripes * words, 0);
        self.stripes.fill(0);
        self.occupancy.resize(stripes, 0);
        self.occupancy.fill(0);
        let stripe = |x: f64| ((x / STRIPE_WIDTH) as usize).min(stripes - 1);
        let mut max_radius: f64 = 0.0;
        for (i, unit) in units.chunks_exact(UNIT_STRIDE).enumerate() {
            let col = stripe(unit[0]);
            self.stripes[col * words + i / 64] |= 1 << (i % 64);
            self.occupancy[col] += 1;
            max_radius = max_radius.max(unit[2]);
        }
        if self.occupancy.iter().any(|&entries| entries > count / 3) {
            separate_units_in_map(units, width, height);
            return;
        }
        for i in 0..count {
            let (first, rest) = units.split_at_mut((i + 1) * UNIT_STRIDE);
            let a = &mut first[i * UNIT_STRIDE..];
            let reach = a[2] + max_radius;
            let bounds = |x: f64| (stripe(x - reach), stripe(x + reach));
            let mut next = i + 1;
            'bounds: while next < count {
                let (min, max) = bounds(a[0]);
                for word in next / 64..words {
                    let mut candidates =
                        (min..=max).fold(0, |bits, col| bits | self.stripes[col * words + word]);
                    if word == next / 64 {
                        candidates &= u64::MAX << (next % 64);
                    }
                    while candidates != 0 {
                        let j = word * 64 + candidates.trailing_zeros() as usize;
                        candidates &= candidates - 1;
                        let offset = (j - i - 1) * UNIT_STRIDE;
                        let b = &mut rest[offset..offset + UNIT_STRIDE];
                        let (a_before, b_before) = (a[0], b[0]);
                        if !separate_pair(a, b, width, height) {
                            continue;
                        }
                        self.relocate(words, i, stripe(a_before), stripe(a[0]));
                        self.relocate(words, j, stripe(b_before), stripe(b[0]));
                        // The bit order matches the direct solver, even after a nudge.
                        if bounds(a[0]) != (min, max) {
                            next = j + 1;
                            continue 'bounds;
                        }
                    }
                }
                break;
            }
        }
    }

    fn relocate(&mut self, words: usize, index: usize, old: usize, new: usize) {
        if old != new {
            let word = index / 64;
            let bit = 1 << (index % 64);
            self.stripes[old * words + word] &= !bit;
            self.stripes[new * words + word] |= bit;
        }
    }
}

// Target rows hold x, y, unit radius, and the resulting hit distance.
// The caller filters teams and keeps row order for ties between hits.
pub fn sweep_bolt(
    targets: &mut [f64],
    origin: [f64; 2],
    direction: [f64; 2],
    length: f64,
    radius: f64,
) {
    for target in targets.chunks_exact_mut(TARGET_STRIDE) {
        target[3] = sweep_hit(
            origin,
            direction,
            length,
            [target[0], target[1]],
            radius + target[2],
        )
        .unwrap_or(-1.0);
    }
}

pub fn sweep_hit(
    origin: [f64; 2],
    [dx, dy]: [f64; 2],
    length: f64,
    target: [f64; 2],
    reach: f64,
) -> Option<f64> {
    let x = target[0] - origin[0];
    let y = target[1] - origin[1];
    if x.abs() > length + reach || y.abs() > length + reach {
        return None;
    }
    let distance = (x * dx + y * dy).clamp(0.0, length);
    let hx = x - dx * distance;
    let hy = y - dy * distance;
    (hx * hx + hy * hy <= reach * reach).then_some(distance)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collision_resolves_in_order_and_preserves_anchored_and_hidden_units() {
        let mut rows = [
            100.0, 450.0, 10.0, 0.0, 0.0, 110.0, 450.0, 10.0, 0.0, 1.0, 127.0, 450.0, 10.0, 1.0,
            3.0, 130.0, 450.0, 10.0, 0.0, 1.0,
        ];
        separate_units(&mut rows, 5200.0);
        assert_eq!(rows[0], 100.0);
        assert_eq!(rows[5], 116.5);
        assert_eq!(rows[10], 127.0);
        assert_eq!(rows[15], 133.5);
    }

    #[test]
    fn striped_collision_matches_direct_resolution_after_crossing_cells() {
        let mut units = Vec::new();
        for i in 0..256 {
            let column = ((i * 19) % 38 + 1) as f64;
            let x = column * 128.0 + (i % 11) as f64 - 5.0;
            let y = 600.0 + (i % 29) as f64;
            let flags = if i % 7 == 0 {
                0.0
            } else if i % 5 == 0 {
                3.0
            } else {
                1.0
            };
            units.extend([x, y, 8.0 + (i % 25) as f64, (i % 2) as f64, flags]);
        }
        let mut expected = units.clone();
        let mut sweep = CollisionSweep::default();
        for _ in 0..4 {
            separate_units_in_map(&mut expected, 5200.0, 4200.0);
            sweep.separate(&mut units, 5200.0, 4200.0);
            assert_eq!(units, expected);
        }
    }

    #[test]
    fn sweep_checks_grazes_and_skips_targets_outside_the_segment() {
        let mut rows = [
            25.0, 20.0, 10.0, 0.0, 70.0, 0.0, 10.0, 0.0, 20.0, 20.1, 10.0, 0.0,
        ];
        sweep_bolt(&mut rows, [0.0, 0.0], [1.0, 0.0], 50.0, 10.0);
        assert_eq!([rows[3], rows[7], rows[11]], [25.0, 50.0, -1.0]);
    }
}
