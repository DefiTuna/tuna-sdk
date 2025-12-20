use crate::HUNDRED_PERCENT;
use fusionamm_core::{try_mul_div, CoreError};

#[cfg(feature = "wasm")]
use fusionamm_macros::wasm_expose;

#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn apply_tuna_protocol_fee(amount: u64, protocol_fee_rate: u16, round_up: bool) -> Result<u64, CoreError> {
    try_mul_div(amount, HUNDRED_PERCENT as u128 - protocol_fee_rate as u128, HUNDRED_PERCENT as u128, round_up)
}

#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn reverse_apply_tuna_protocol_fee(amount: u64, protocol_fee_rate: u16, round_up: bool) -> Result<u64, CoreError> {
    try_mul_div(amount, HUNDRED_PERCENT as u128, HUNDRED_PERCENT as u128 - protocol_fee_rate as u128, round_up)
}

#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn calculate_tuna_protocol_fee(collateral: u64, borrow: u64, protocol_fee_rate_on_collateral: u16, protocol_fee_rate: u16) -> u64 {
    ((collateral as u128 * protocol_fee_rate_on_collateral as u128 + borrow as u128 * protocol_fee_rate as u128) / HUNDRED_PERCENT as u128) as u64
}

/// Similar to the function implemented in FusionAMM, but supports various rounding modes.
pub fn apply_swap_fee(amount: u64, fee_rate: u16, round_up: bool) -> Result<u64, CoreError> {
    try_mul_div(amount, 1_000_000 - fee_rate as u128, 1_000_000, round_up)
}

/// Similar to the function implemented in FusionAMM, but supports various rounding modes.
pub fn reverse_apply_swap_fee(amount: u64, fee_rate: u16, round_up: bool) -> Result<u64, CoreError> {
    try_mul_div(amount, 1_000_000, 1_000_000 - fee_rate as u128, round_up)
}
