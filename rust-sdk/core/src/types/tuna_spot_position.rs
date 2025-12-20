#![allow(non_snake_case)]

#[cfg(feature = "wasm")]
use fusionamm_macros::wasm_expose;

pub const TOKEN_A: u8 = 0;
pub const TOKEN_B: u8 = 1;

pub const MARKET_MAKER_ORCA: u8 = 0;
pub const MARKET_MAKER_FUSION: u8 = 1;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "wasm", wasm_expose)]
pub struct TunaSpotPositionFacade {
    /// Struct version
    pub version: u16,
    /// Market maker (Orca, Fusion)
    pub market_maker: u8,
    /// Position token: A (LONG, B is borrowed), B (SHORT, A is borrowed)
    pub position_token: u8,
    /// The token used as collateral.
    pub collateral_token: u8,
    /// Position options (unused)
    pub flags: u32,
    /// The total amount of the position in token A (long) or B (short).
    pub amount: u64,
    /// The amount of shares borrowed by the user from vault B (long) or A (short).
    pub loan_shares: u64,
    /// The amount of funds borrowed by the user from vault B (long) or A (short). Doesn't include accrued interest.
    pub loan_funds: u64,
    /// Position entry sqrt price.
    pub entry_sqrt_price: u128,
    /// Position lower limit order sqrt price (stop loss for a LONG position).
    pub lower_limit_order_sqrt_price: u128,
    /// Position upper limit order sqrt price (take profit for a LONG position).
    pub upper_limit_order_sqrt_price: u128,
}
