#![allow(non_snake_case)]

#[cfg(feature = "wasm")]
use fusionamm_macros::wasm_expose;

#[cfg_attr(feature = "wasm", wasm_expose)]
pub const HUNDRED_PERCENT: u32 = 1000000;

#[cfg_attr(feature = "wasm", wasm_expose)]
pub const COMPUTED_AMOUNT: u64 = 18446744073709551615;
