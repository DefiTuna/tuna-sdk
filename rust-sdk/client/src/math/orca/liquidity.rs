use crate::math::orca::token_math::{get_amount_delta_a, get_amount_delta_b};
use crate::{math::U256, TunaError as ErrorCode};
use std::ops::{Div, Mul, Shr};

pub fn get_liquidity_for_amounts(
    sqrt_price: u128,
    sqrt_price_a_x64: u128,
    sqrt_price_b_x64: u128,
    amount_a: u64,
    amount_b: u64,
) -> Result<u128, ErrorCode> {
    if sqrt_price_a_x64 == sqrt_price_b_x64 {
        return Err(ErrorCode::ZeroPriceRange);
    }

    let (sqrt_price_a, sqrt_price_b) = if sqrt_price_a_x64 > sqrt_price_b_x64 {
        (sqrt_price_b_x64, sqrt_price_a_x64)
    } else {
        (sqrt_price_a_x64, sqrt_price_b_x64)
    };

    if sqrt_price <= sqrt_price_a {
        get_liquidity_for_amount_a(amount_a, sqrt_price_a, sqrt_price_b)
    } else if sqrt_price < sqrt_price_b {
        let liquidity_a = get_liquidity_for_amount_a(amount_a, sqrt_price, sqrt_price_b)?;
        let liquidity_b = get_liquidity_for_amount_b(amount_b, sqrt_price_a, sqrt_price)?;
        if liquidity_a < liquidity_b {
            Ok(liquidity_a)
        } else {
            Ok(liquidity_b)
        }
    } else {
        get_liquidity_for_amount_b(amount_b, sqrt_price_a, sqrt_price_b)
    }
}

pub fn get_amounts_for_liquidity(sqrt_price: u128, sqrt_price_a_x64: u128, sqrt_price_b_x64: u128, liquidity: u128) -> Result<(u64, u64), ErrorCode> {
    if sqrt_price_a_x64 == sqrt_price_b_x64 {
        return Err(ErrorCode::ZeroPriceRange);
    }

    let (sqrt_price_a, sqrt_price_b) = if sqrt_price_a_x64 > sqrt_price_b_x64 {
        (sqrt_price_b_x64, sqrt_price_a_x64)
    } else {
        (sqrt_price_a_x64, sqrt_price_b_x64)
    };

    let mut amount_a = 0;
    let mut amount_b = 0;

    if sqrt_price <= sqrt_price_a {
        amount_a = get_amount_delta_a(sqrt_price_a, sqrt_price_b, liquidity)?;
    } else if sqrt_price < sqrt_price_b {
        amount_a = get_amount_delta_a(sqrt_price, sqrt_price_b, liquidity)?;
        amount_b = get_amount_delta_b(sqrt_price_a, sqrt_price, liquidity)?;
    } else {
        amount_b = get_amount_delta_b(sqrt_price_a, sqrt_price_b, liquidity)?;
    }

    Ok((amount_a, amount_b))
}

fn get_liquidity_for_amount_a(amount: u64, sqrt_price_lower: u128, sqrt_price_upper: u128) -> Result<u128, ErrorCode> {
    let wide_amount = U256::from(amount);
    let intermediate = U256::from(sqrt_price_upper).mul(U256::from(sqrt_price_lower)).shr(64);
    let delta_sqrt_price = U256::from(sqrt_price_upper - sqrt_price_lower);

    let liquidity: u128 = intermediate
        .mul(wide_amount)
        .div(delta_sqrt_price)
        .try_into()
        .map_err(|_| ErrorCode::TypeCastOverflow)?;

    Ok(liquidity)
}

fn get_liquidity_for_amount_b(amount: u64, sqrt_price_lower: u128, sqrt_price_upper: u128) -> Result<u128, ErrorCode> {
    Ok(((amount as u128) << 64u128) / (sqrt_price_upper - sqrt_price_lower))
}

#[cfg(test)]
mod tests {
    use crate::orca::liquidity::{get_amounts_for_liquidity, get_liquidity_for_amounts};

    // returns the sqrt price as a 64x64
    fn encode_price_sqrt(reserve1: u128, reserve0: u128) -> u128 {
        let sqrt_price = ((reserve1 as f64) / (reserve0 as f64)).sqrt();
        (sqrt_price * (2_f64.powf(64_f64))) as u128
    }

    #[test]
    fn test_get_liquidity_for_amounts_for_price_inside() {
        let sqrt_price_x96 = encode_price_sqrt(1, 1);
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let liquidity = get_liquidity_for_amounts(sqrt_price_x96, sqrt_price_ax96, sqrt_price_bx96, 100, 200).unwrap();
        assert_eq!(liquidity, 2148);
    }

    #[test]
    fn test_get_liquidity_for_amounts_for_price_below() {
        let sqrt_price_x96 = encode_price_sqrt(99, 110);
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let liquidity = get_liquidity_for_amounts(sqrt_price_x96, sqrt_price_ax96, sqrt_price_bx96, 100, 200).unwrap();
        assert_eq!(liquidity, 1048);
    }

    #[test]
    fn test_get_liquidity_for_amounts_for_price_above() {
        let sqrt_price_x96 = encode_price_sqrt(111, 100);
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let liquidity = get_liquidity_for_amounts(sqrt_price_x96, sqrt_price_ax96, sqrt_price_bx96, 100, 200).unwrap();
        assert_eq!(liquidity, 2097);
    }

    #[test]
    fn test_get_liquidity_for_amounts_ror_price_equal_to_lower_boundary() {
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let liquidity = get_liquidity_for_amounts(sqrt_price_ax96, sqrt_price_ax96, sqrt_price_bx96, 100, 200).unwrap();
        assert_eq!(liquidity, 1048);
    }

    #[test]
    fn test_get_liquidity_for_amounts_ror_price_equal_to_upper_boundary() {
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let liquidity = get_liquidity_for_amounts(sqrt_price_bx96, sqrt_price_ax96, sqrt_price_bx96, 100, 200).unwrap();
        assert_eq!(liquidity, 2097);
    }

    #[test]
    fn test_get_amounts_for_price_inside() {
        let sqrt_price_x96 = encode_price_sqrt(1, 1);
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let (a, b) = get_amounts_for_liquidity(sqrt_price_x96, sqrt_price_ax96, sqrt_price_bx96, 2148).unwrap();
        assert_eq!(a, 99);
        assert_eq!(b, 99);
    }

    #[test]
    fn test_get_amounts_for_price_below() {
        let sqrt_price_x96 = encode_price_sqrt(99, 110);
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let (a, b) = get_amounts_for_liquidity(sqrt_price_x96, sqrt_price_ax96, sqrt_price_bx96, 1048).unwrap();
        assert_eq!(a, 99);
        assert_eq!(b, 0);
    }

    #[test]
    fn test_get_amounts_for_price_above() {
        let sqrt_price_x96 = encode_price_sqrt(111, 100);
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let (a, b) = get_amounts_for_liquidity(sqrt_price_x96, sqrt_price_ax96, sqrt_price_bx96, 2097).unwrap();
        assert_eq!(a, 0);
        assert_eq!(b, 199);
    }

    #[test]
    fn test_get_amounts_for_price_on_lower_boundary() {
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let (a, b) = get_amounts_for_liquidity(sqrt_price_ax96, sqrt_price_ax96, sqrt_price_bx96, 1048).unwrap();
        assert_eq!(a, 99);
        assert_eq!(b, 0);
    }

    #[test]
    fn test_get_amounts_for_price_on_upper_boundary() {
        let sqrt_price_ax96 = encode_price_sqrt(100, 110);
        let sqrt_price_bx96 = encode_price_sqrt(110, 100);
        let (a, b) = get_amounts_for_liquidity(sqrt_price_bx96, sqrt_price_ax96, sqrt_price_bx96, 2097).unwrap();
        assert_eq!(a, 0);
        assert_eq!(b, 199);
    }
}
