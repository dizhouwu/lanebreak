use napi::bindgen_prelude::Float64Array;
use napi::{Error, Result};
use napi_derive::napi;

#[napi]
fn separate_units(mut units: Float64Array, width: f64) -> Result<()> {
    if !units.len().is_multiple_of(lanebreak_physics::UNIT_STRIDE)
        || !width.is_finite()
        || width < 60.0
    {
        return Err(Error::from_reason("Invalid collision buffer or world width"));
    }
    lanebreak_physics::separate_units(&mut units, width);
    Ok(())
}

#[napi]
fn sweep_bolt(
    mut targets: Float64Array,
    x: f64,
    y: f64,
    dx: f64,
    dy: f64,
    length: f64,
    radius: f64,
) -> Result<()> {
    if !targets.len().is_multiple_of(lanebreak_physics::TARGET_STRIDE)
        || !length.is_finite()
        || length < 0.0
    {
        return Err(Error::from_reason("Invalid projectile buffer or travel distance"));
    }
    lanebreak_physics::sweep_bolt(&mut targets, [x, y], [dx, dy], length, radius);
    Ok(())
}
