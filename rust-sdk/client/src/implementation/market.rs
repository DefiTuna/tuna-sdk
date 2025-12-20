use crate::consts::LEVERAGE_ONE;
use crate::generated::accounts::Market;
use std::fmt;

impl Market {
    pub fn get_max_leverage(&self) -> f64 {
        self.max_leverage as f64 / LEVERAGE_ONE as f64
    }
}

impl fmt::Display for Market {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "pool={}", self.pool.to_string())
    }
}
