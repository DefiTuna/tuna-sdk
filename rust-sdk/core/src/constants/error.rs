#![allow(non_snake_case)]

use fusionamm_core::CoreError;

#[cfg(feature = "wasm")]
use fusionamm_macros::wasm_expose;

#[cfg_attr(feature = "wasm", wasm_expose)]
pub const INVALID_ARGUMENTS: CoreError = "Invalid function arguments";

#[cfg_attr(feature = "wasm", wasm_expose)]
pub const JUPITER_QUOTE_REQUEST_ERROR: CoreError = "Jupiter quote request failed";

#[cfg_attr(feature = "wasm", wasm_expose)]
pub const JUPITER_SWAP_INSTRUCTIONS_REQUEST_ERROR: CoreError = "Jupiter swap instructions request failed";
