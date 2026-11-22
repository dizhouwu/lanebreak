const SNAP_DISTANCE_SQUARED: f64 = 250.0 * 250.0;
const ATLAS_SCALE: f32 = 1.0 / 2048.0;

pub(super) fn interpolate(input: &[f64], output: &mut [f64], fraction: f64) {
    for (points, result) in input.chunks_exact(4).zip(output.chunks_exact_mut(2)) {
        let (x, y, to_x, to_y) = (points[0], points[1], points[2], points[3]);
        let (dx, dy) = (to_x - x, to_y - y);
        let (x, y) = if dx * dx + dy * dy > SNAP_DISTANCE_SQUARED {
            (to_x, to_y)
        } else {
            (x + dx * fraction, y + dy * fraction)
        };
        result.copy_from_slice(&[x, y]);
    }
}

pub(super) const SPRITE_WORDS: usize = 15;

// Replace sprite commands with the layout consumed by the WebGL instance attributes.
pub(super) fn prepare_sprites(commands: &mut [f32]) {
    for row in commands.chunks_exact_mut(SPRITE_WORDS) {
        if row[13] != 0.0 {
            row[0] += row[2] * 0.5;
            row[1] += row[3] * 0.5;
        }
        for coordinate in &mut row[4..8] {
            *coordinate *= ATLAS_SCALE;
        }
        let alpha = row[11];
        for channel in &mut row[8..11] {
            *channel *= alpha;
        }
        let (sine, cosine) = if row[12] == 0.0 {
            (0.0, 1.0)
        } else {
            row[12].sin_cos()
        };
        row[12] = cosine;
        row[13] = sine;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn motion_blends_nearby_points_and_snaps_across_jumps() {
        let mut out = [0.0; 4];
        interpolate(&[0.0, 2.0, 10.0, 6.0, 0.0, 0.0, 251.0, 0.0], &mut out, 0.25);
        assert_eq!(out, [2.5, 3.0, 251.0, 0.0]);
    }

    #[test]
    fn sprite_commands_become_premultiplied_instances() {
        let mut row = [
            14.0,
            20.0,
            10.0,
            6.0,
            0.5,
            0.5,
            4.5,
            8.5,
            1.0,
            0.5,
            0.25,
            0.5,
            std::f32::consts::FRAC_PI_2,
            1.0,
            -1.0,
        ];
        prepare_sprites(&mut row);
        assert_eq!(&row[..4], &[19.0, 23.0, 10.0, 6.0]);
        assert_eq!(&row[4..8], &[0.5, 0.5, 4.5, 8.5].map(|x| x * ATLAS_SCALE));
        assert_eq!(&row[8..12], &[0.5, 0.25, 0.125, 0.5]);
        assert!(row[12].abs() < 1e-6);
        assert_eq!(&row[13..], &[1.0, -1.0]);
    }
}
