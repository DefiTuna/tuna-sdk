use crate::accounts::TunaSpotPosition;
use defituna_core::TunaSpotPositionFacade;


impl From<TunaSpotPosition> for TunaSpotPositionFacade {
    fn from(val: TunaSpotPosition) -> Self {
        TunaSpotPositionFacade {
            version: val.version,
            market_maker: val.market_maker as u8,
            position_token: val.position_token as u8,
            collateral_token: val.collateral_token as u8,
            flags: val.flags,
            amount: val.amount,
            loan_shares: val.loan_shares,
            loan_funds: val.loan_funds,
            entry_sqrt_price: val.entry_sqrt_price,
            lower_limit_order_sqrt_price: val.lower_limit_order_sqrt_price,
            upper_limit_order_sqrt_price: val.upper_limit_order_sqrt_price,
        }
    }
}
