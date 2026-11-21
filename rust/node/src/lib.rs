use lanebreak_engine::Match;
use napi::{Error, Result};
use napi_derive::napi;

#[napi]
pub struct RustMatch {
    inner: Match,
}

#[napi]
impl RustMatch {
    #[napi(constructor)]
    pub fn new(options: String) -> Result<Self> {
        Match::from_options(&options)
            .map(|inner| Self { inner })
            .map_err(|err| Error::from_reason(err.to_string()))
    }

    #[napi]
    pub fn step(&mut self, dt: f64, count: u32) {
        self.inner.step(dt, count);
    }

    #[napi]
    pub fn ended(&self) -> bool {
        self.inner.ended()
    }

    #[napi]
    pub fn order(&mut self, team: u32, command: String) -> Option<String> {
        self.inner.order_json(team as usize, &command)
    }

    #[napi]
    pub fn finish(&mut self, winner: Option<u32>, reason: String) {
        self.inner
            .finish(winner.map(|winner| winner as usize), reason);
    }

    #[napi]
    pub fn notice(&mut self, team: u32, text: String) {
        self.inner.notice(team as usize, &text);
    }

    #[napi]
    pub fn set_bot(&mut self, team: u32, bot: Option<String>) {
        self.inner.set_bot(team as usize, bot);
    }

    #[napi]
    pub fn snapshot(&self, team: u32, full: bool) -> String {
        self.inner.snapshot(team as usize, full)
    }

    #[napi]
    pub fn snapshot_world(&self) -> String {
        self.inner.snapshot_world()
    }

    #[napi]
    pub fn snapshot_view(&self, team: u32, full: bool) -> String {
        self.inner.snapshot_view(team as usize, full)
    }
}

#[napi]
pub fn valid_order(input: String) -> bool {
    Match::valid_order(&input)
}
