use crate::consts::LEVERAGE_ONE;
use crate::generated::accounts::Market;
use crate::math::Fixed128;
use std::fmt;

impl Market {
    pub fn get_max_leverage(&self) -> Fixed128 {
        Fixed128::from_num(self.max_leverage) / Fixed128::from_num(LEVERAGE_ONE)
    }
}

impl fmt::Display for Market {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "pool={}", self.pool.to_string())
    }
}
