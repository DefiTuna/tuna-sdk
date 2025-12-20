use crate::math::Fixed128;
use fixed::types::U64F64;
use fusionamm_core::{CoreError, ARITHMETIC_OVERFLOW};

pub fn sqrt_price_x64_to_price_fixed(sqrt_price_x64: u128) -> Result<Fixed128, CoreError> {
    let sqrt_price = Fixed128::from_bits(sqrt_price_x64 >> (64 - Fixed128::FRAC_NBITS));
    sqrt_price.checked_mul(sqrt_price).ok_or(ARITHMETIC_OVERFLOW)
}

pub fn sqrt_price_x64_to_price_x64(sqrt_price_x64: u128) -> Result<U64F64, CoreError> {
    let sqrt_price = U64F64::from_bits(sqrt_price_x64);
    sqrt_price.checked_mul(sqrt_price).ok_or(ARITHMETIC_OVERFLOW)
}
