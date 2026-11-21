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
            let required = a[2] + b[2];
            let dx = b[0] - a[0];
            let dy = b[1] - a[1];
            if dx.abs() >= required || dy.abs() >= required {
                continue;
            }
            let a_flags = a[4] as u32;
            let b_flags = b[4] as u32;
            if a[3] != b[3] && ((a_flags | b_flags) & VEILED) != 0 {
                continue;
            }
            let a_moves = (a_flags & MOVABLE) != 0;
            let b_moves = (b_flags & MOVABLE) != 0;
            if !a_moves && !b_moves {
                continue;
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
                continue;
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
    let [dx, dy] = direction;
    for target in targets.chunks_exact_mut(TARGET_STRIDE) {
        let x = target[0] - origin[0];
        let y = target[1] - origin[1];
        let reach = radius + target[2];
        target[3] = -1.0;
        if x.abs() > length + reach || y.abs() > length + reach {
            continue;
        }
        let distance = (x * dx + y * dy).clamp(0.0, length);
        let hx = x - dx * distance;
        let hy = y - dy * distance;
        if hx * hx + hy * hy <= reach * reach {
            target[3] = distance;
        }
    }
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
    fn sweep_checks_grazes_and_skips_targets_outside_the_segment() {
        let mut rows = [
            25.0, 20.0, 10.0, 0.0, 70.0, 0.0, 10.0, 0.0, 20.0, 20.1, 10.0, 0.0,
        ];
        sweep_bolt(&mut rows, [0.0, 0.0], [1.0, 0.0], 50.0, 10.0);
        assert_eq!([rows[3], rows[7], rows[11]], [25.0, 50.0, -1.0]);
    }
}
