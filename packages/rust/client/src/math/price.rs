use crate::math::Fixed128;
use crate::TunaError as ErrorCode;
use fixed::types::U64F64;

pub fn sqrt_price_x64_to_price_fixed(sqrt_price_x64: u128) -> Result<Fixed128, ErrorCode> {
    let sqrt_price = Fixed128::from_bits(sqrt_price_x64 >> (64 - Fixed128::FRAC_NBITS));
    sqrt_price.checked_mul(sqrt_price).ok_or(ErrorCode::MathOverflow)
}

pub fn sqrt_price_x64_to_price_x64(sqrt_price_x64: u128) -> Result<U64F64, ErrorCode> {
    let sqrt_price = U64F64::from_bits(sqrt_price_x64);
    sqrt_price.checked_mul(sqrt_price).ok_or(ErrorCode::MathOverflow)
}
