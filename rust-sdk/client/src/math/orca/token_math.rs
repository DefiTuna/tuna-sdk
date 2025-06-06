use crate::math::fixed::mul_u256;
use crate::math::U256;
use crate::TunaError as ErrorCode;

const Q64_RESOLUTION: u8 = 64;
const Q64_MASK: u128 = 0xFFFF_FFFF_FFFF_FFFF;

#[derive(Debug)]
enum AmountDeltaU64 {
    Valid(u64),
    ExceedsMax(ErrorCode),
}

//
// Get change in token_a corresponding to a change in price
//

// 6.16
// Δt_a = Δ(1 / sqrt_price) * liquidity

// Replace delta
// Δt_a = (1 / sqrt_price_upper - 1 / sqrt_price_lower) * liquidity

// Common denominator to simplify
// Δt_a = ((sqrt_price_lower - sqrt_price_upper) / (sqrt_price_upper * sqrt_price_lower)) * liquidity

// Δt_a = (liquidity * (sqrt_price_lower - sqrt_price_upper)) / (sqrt_price_upper * sqrt_price_lower)
pub fn get_amount_delta_a(sqrt_price_0: u128, sqrt_price_1: u128, liquidity: u128) -> Result<u64, ErrorCode> {
    match try_get_amount_delta_a(sqrt_price_0, sqrt_price_1, liquidity) {
        Ok(AmountDeltaU64::Valid(value)) => Ok(value),
        Ok(AmountDeltaU64::ExceedsMax(error)) => Err(error),
        Err(error) => Err(error),
    }
}

fn try_get_amount_delta_a(sqrt_price_0: u128, sqrt_price_1: u128, liquidity: u128) -> Result<AmountDeltaU64, ErrorCode> {
    let (sqrt_price_lower, sqrt_price_upper) = increasing_price_order(sqrt_price_0, sqrt_price_1);

    let sqrt_price_diff = sqrt_price_upper - sqrt_price_lower;

    let numerator = mul_u256(liquidity, sqrt_price_diff).checked_shl(64).ok_or(ErrorCode::MathOverflow)?;

    let denominator = mul_u256(sqrt_price_upper, sqrt_price_lower);
    if denominator == U256::zero() {
        return Err(ErrorCode::MathOverflow);
    }

    let quotient = numerator / denominator;

    match quotient.try_into_u128() {
        Ok(result) => {
            if result > u64::MAX as u128 {
                return Ok(AmountDeltaU64::ExceedsMax(ErrorCode::TypeCastOverflow));
            }

            Ok(AmountDeltaU64::Valid(result as u64))
        }
        Err(err) => Ok(AmountDeltaU64::ExceedsMax(err)),
    }
}

//
// Get change in token_b corresponding to a change in price
//

// 6.14
// Δt_b = Δ(sqrt_price) * liquidity

// Replace delta
// Δt_b = (sqrt_price_upper - sqrt_price_lower) * liquidity
pub fn get_amount_delta_b(sqrt_price_0: u128, sqrt_price_1: u128, liquidity: u128) -> Result<u64, ErrorCode> {
    match try_get_amount_delta_b(sqrt_price_0, sqrt_price_1, liquidity, false) {
        Ok(AmountDeltaU64::Valid(value)) => Ok(value),
        Ok(AmountDeltaU64::ExceedsMax(error)) => Err(error),
        Err(error) => Err(error),
    }
}

fn try_get_amount_delta_b(sqrt_price_0: u128, sqrt_price_1: u128, liquidity: u128, round_up: bool) -> Result<AmountDeltaU64, ErrorCode> {
    let (sqrt_price_lower, sqrt_price_upper) = increasing_price_order(sqrt_price_0, sqrt_price_1);

    // customized checked_mul_shift_right_round_up_if

    let n0 = liquidity;
    let n1 = sqrt_price_upper - sqrt_price_lower;

    if n0 == 0 || n1 == 0 {
        return Ok(AmountDeltaU64::Valid(0));
    }

    if let Some(p) = n0.checked_mul(n1) {
        let result = (p >> Q64_RESOLUTION) as u64;

        let should_round = round_up && (p & Q64_MASK > 0);
        if should_round && result == u64::MAX {
            return Ok(AmountDeltaU64::ExceedsMax(ErrorCode::MathOverflow));
        }

        Ok(AmountDeltaU64::Valid(if should_round { result + 1 } else { result }))
    } else {
        Ok(AmountDeltaU64::ExceedsMax(ErrorCode::MathOverflow))
    }
}

pub fn increasing_price_order(sqrt_price_0: u128, sqrt_price_1: u128) -> (u128, u128) {
    if sqrt_price_0 > sqrt_price_1 {
        (sqrt_price_1, sqrt_price_0)
    } else {
        (sqrt_price_0, sqrt_price_1)
    }
}
