use super::*;
use std::cell::RefCell;

#[derive(Default)]
struct Runtime {
    games: BTreeMap<u32, Match>,
    key: u32,
    input: Vec<u8>,
    output: String,
    snapshot_json: Vec<u8>,
    snapshot_rows: Vec<u32>,
    snapshot_frame: [u32; 4],
}

thread_local! {
    static RUNTIME: RefCell<Runtime> = RefCell::new(Runtime::default());
}

#[unsafe(no_mangle)]
extern "C" fn engine_input(length: usize) -> *mut u8 {
    RUNTIME.with_borrow_mut(|r| {
        r.input.resize(length, 0);
        r.input.as_mut_ptr()
    })
}

#[unsafe(no_mangle)]
extern "C" fn engine_output_len() -> usize {
    RUNTIME.with_borrow(|r| r.output.len())
}

#[unsafe(no_mangle)]
extern "C" fn engine_open() -> u32 {
    RUNTIME.with_borrow_mut(|r| {
        let Ok(input) = std::str::from_utf8(&r.input) else {
            return 0;
        };
        match Match::from_options(input) {
            Ok(game) => {
                r.key += 1;
                r.games.insert(r.key, game);
                r.key
            }
            Err(err) => {
                r.output = err.to_string();
                0
            }
        }
    })
}

#[unsafe(no_mangle)]
extern "C" fn engine_close(id: u32) {
    RUNTIME.with_borrow_mut(|r| r.games.remove(&id));
}

#[unsafe(no_mangle)]
extern "C" fn engine_ended(id: u32) -> bool {
    RUNTIME.with_borrow(|r| r.games.get(&id).is_none_or(Match::ended))
}

#[unsafe(no_mangle)]
extern "C" fn engine_step(id: u32, dt: f64, count: u32) {
    RUNTIME.with_borrow_mut(|r| {
        if let Some(game) = r.games.get_mut(&id) {
            game.step(dt, count);
        }
    });
}

#[unsafe(no_mangle)]
extern "C" fn engine_snapshot(id: u32, team: usize, full: bool) -> *const u32 {
    RUNTIME.with_borrow_mut(|r| {
        if let Some(game) = r.games.get(&id) {
            game.browser_snapshot(team, full, &mut r.snapshot_json, &mut r.snapshot_rows);
        } else {
            r.snapshot_json.clear();
            r.snapshot_json.extend_from_slice(b"null");
            r.snapshot_rows.clear();
        }
        r.snapshot_frame = [
            r.snapshot_json.as_ptr() as u32,
            r.snapshot_json.len() as u32,
            r.snapshot_rows.as_ptr() as u32,
            r.snapshot_rows.len() as u32,
        ];
        r.snapshot_frame.as_ptr()
    })
}

#[unsafe(no_mangle)]
extern "C" fn engine_order(id: u32, team: usize) -> *const u8 {
    RUNTIME.with_borrow_mut(|r| {
        let input = std::str::from_utf8(&r.input).unwrap_or("");
        r.output = r.games.get_mut(&id).map_or_else(
            || "Invalid order".into(),
            |game| game.order_json(team, input).unwrap_or_default(),
        );
        r.output.as_ptr()
    })
}

#[unsafe(no_mangle)]
extern "C" fn engine_finish(id: u32, winner: i32) {
    RUNTIME.with_borrow_mut(|r| {
        if let Some(game) = r.games.get_mut(&id) {
            let reason = String::from_utf8_lossy(&r.input).into_owned();
            game.finish(usize::try_from(winner).ok(), reason);
        }
    });
}
