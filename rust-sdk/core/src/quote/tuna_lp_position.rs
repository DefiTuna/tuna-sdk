#![allow(clippy::collapsible_else_if)]
#![allow(clippy::too_many_arguments)]

use crate::{calculate_tuna_protocol_fee, sqrt_price_x64_to_price_x64, COMPUTED_AMOUNT, HUNDRED_PERCENT, INVALID_ARGUMENTS};
use fixed::types::U64F64;
use fusionamm_core::{
    get_amount_a_from_liquidity, get_amount_b_from_liquidity, get_amounts_from_liquidity, get_liquidity_from_amount_a, get_liquidity_from_amount_b,
    get_liquidity_from_amounts, position_ratio_x64, tick_index_to_sqrt_price, try_apply_swap_fee, CoreError, ARITHMETIC_OVERFLOW, Q64_RESOLUTION,
};

#[cfg(feature = "wasm")]
use fusionamm_macros::wasm_expose;

#[derive(Debug, Copy, Clone, PartialEq)]
#[cfg_attr(feature = "wasm", wasm_expose)]
pub struct LiquidationPrices {
    pub lower: f64,
    pub upper: f64,
}

///
/// Calculates the liquidation prices inside the position's range.
///
/// t - liquidation threshold
/// Dx - debt x
/// Dy - debt y
/// Lx - leftovers x
/// Ly - leftovers y
/// √P = x - current price
/// √Pu = u - upper sqrt price
/// √Pl = l - lower sqrt price
/// L - liquidity
///
/// t = (Dx⋅P + Dy) / (Δx⋅P + Lx⋅P + Δy + Ly), where
///   Δx = L⋅(1/x - 1/u)
///   Δy = L⋅(x - l)
///
/// x1,2 = ...
///
/// # Parameters
/// - `lower_sqrt_price`: The lower square root price boundary.
/// - `upper_sqrt_price`: The upper square root price boundary.
/// - `liquidity`: The liquidity provided by the user.
/// - `leftovers_a`: The amount of leftovers A in the existing position.
/// - `leftovers_b`: The amount of leftovers B in the existing position*
/// - `debt_a`: The amount of tokens A borrowed.
/// - `debt_b`: The amount of tokens B borrowed.
/// - `liquidation_threshold`: The liquidation threshold of the liquidator.
///
/// # Returns
/// - `LiquidationPrices`: An object containing lower/upper liquidation prices.
fn compute_liquidation_prices_inside(
    lower_sqrt_price: u128,
    upper_sqrt_price: u128,
    liquidity: u128,
    leftovers_a: u64,
    leftovers_b: u64,
    debt_a: u64,
    debt_b: u64,
    liquidation_threshold: u32,
) -> Result<LiquidationPrices, CoreError> {
    let liquidation_threshold_f = liquidation_threshold as f64 / HUNDRED_PERCENT as f64;
    let liquidity_f = liquidity as f64;
    let lower_sqrt_price_f = lower_sqrt_price as f64 / Q64_RESOLUTION;
    let upper_sqrt_price_f = upper_sqrt_price as f64 / Q64_RESOLUTION;

    let a = debt_a as f64 + liquidation_threshold_f * (liquidity_f / upper_sqrt_price_f - leftovers_a as f64);
    let b = -2.0 * liquidation_threshold_f * liquidity_f;
    let c = debt_b as f64 + liquidation_threshold_f * (liquidity_f * lower_sqrt_price_f - leftovers_b as f64);
    let d = b * b - 4.0 * a * c;

    let mut lower_liquidation_sqrt_price = 0.0;
    let mut upper_liquidation_sqrt_price = 0.0;

    if d >= 0.0 {
        lower_liquidation_sqrt_price = (-b - d.sqrt()) / (2.0 * a);
        upper_liquidation_sqrt_price = (-b + d.sqrt()) / (2.0 * a);
        if lower_liquidation_sqrt_price < 0.0 || lower_liquidation_sqrt_price < lower_sqrt_price_f {
            lower_liquidation_sqrt_price = 0.0;
        }
        if upper_liquidation_sqrt_price < 0.0 || upper_liquidation_sqrt_price > upper_sqrt_price_f {
            upper_liquidation_sqrt_price = 0.0;
        }
    }

    Ok(LiquidationPrices {
        lower: lower_liquidation_sqrt_price * lower_liquidation_sqrt_price,
        upper: upper_liquidation_sqrt_price * upper_liquidation_sqrt_price,
    })
}

/// Calculates a liquidation price for the outside range (above OR under).
///
/// liquidation_threshold = total_debt / (total_balance + leftovers)
///
/// t - liquidation threshold
/// P - liquidation price
/// Dx - debt x
/// Dy - debt y
/// Lx - leftovers x
/// Ly - leftovers y
/// X - amount of x tokens
/// Y - amount of y tokens
///
/// Lower liquidation price:
/// t = (Dx + Dy / P) / (X + Lx + Ly/P)  =>  P = (Dy - t⋅Ly) / (t⋅(X+Lx) - Dx)
///
/// Upper liquidation price:
/// t = (Dx⋅P + Dy) / (Y + Lx⋅P + Ly)  =>  P = (t⋅(Y + Ly) - Dy) / (Dx - t⋅Lx)
///
/// # Parameters
/// - `amount_a`: The amount of tokens A at the boundary price.
/// - `amount_b`: The amount of tokens B at the boundary price.
/// - `leftovers_a`: The amount of leftovers A.
/// - `leftovers_b`: The amount of leftovers B.
/// - `debt_a`: The amount of tokens A borrowed.
/// - `debt_b`: The amount of tokens B borrowed.
/// - `liquidation_threshold`: - The liquidation threshold of the liquidator.
///
/// # Returns
/// The calculated liquidation price.
fn calculate_liquidation_outside(
    amount_a: u64,
    amount_b: u64,
    leftovers_a: u64,
    leftovers_b: u64,
    debt_a: u64,
    debt_b: u64,
    liquidation_threshold: u32,
) -> Result<f64, CoreError> {
    let liquidation_threshold_f = liquidation_threshold as f64 / HUNDRED_PERCENT as f64;

    if amount_a == 0 && amount_b == 0 {
        Ok(0.0)
    } else if amount_a > 0 && amount_b == 0 {
        // Lower liquidation price
        let numerator = debt_b as f64 - liquidation_threshold_f * leftovers_b as f64;
        let denominator = liquidation_threshold_f * (amount_a + leftovers_a) as f64 - debt_a as f64;
        Ok(numerator / denominator)
    } else if amount_a == 0 && amount_b > 0 {
        // Upper liquidation price
        let numerator = liquidation_threshold_f * (amount_b + leftovers_b) as f64 - debt_b as f64;
        let denominator = debt_a as f64 - liquidation_threshold_f * leftovers_a as f64;
        if denominator == 0.0 {
            return Ok(0.0);
        }
        Ok(numerator / denominator)
    } else {
        Err(INVALID_ARGUMENTS)
    }
}

/// Calculates the liquidation prices outside the position's range (above AND under).
///
/// # Parameters
/// - `lower_sqrt_price`: The lower square root price boundary.
/// - `upper_sqrt_price`: The upper square root price boundary.
/// - `liquidity`: The liquidity provided by the user.
/// - `leftovers_a`: The amount of leftovers A.
/// - `leftovers_b`: The amount of leftovers B.
/// - `debt_a`: The amount of tokens A borrowed.
/// - `debt_b`: The amount of tokens B borrowed.
/// - `liquidation_threshold`: The liquidation threshold of the liquidator.
///
/// # Returns
/// - `LiquidationPrices`: An object containing lower/upper liquidation prices.
fn compute_liquidation_prices_outside(
    lower_sqrt_price: u128,
    upper_sqrt_price: u128,
    liquidity: u128,
    leftovers_a: u64,
    leftovers_b: u64,
    debt_a: u64,
    debt_b: u64,
    liquidation_threshold: u32,
) -> Result<LiquidationPrices, CoreError> {
    let amount_a = get_amount_a_from_liquidity(liquidity, lower_sqrt_price, upper_sqrt_price, false)?;
    let amount_b = get_amount_b_from_liquidity(liquidity, lower_sqrt_price, upper_sqrt_price, false)?;

    let mut liquidation_price_for_a = calculate_liquidation_outside(amount_a, 0, leftovers_a, leftovers_b, debt_a, debt_b, liquidation_threshold)?;
    let mut liquidation_price_for_b = calculate_liquidation_outside(0, amount_b, leftovers_a, leftovers_b, debt_a, debt_b, liquidation_threshold)?;

    if liquidation_price_for_a < 0.0 || liquidation_price_for_a > (lower_sqrt_price as f64 / Q64_RESOLUTION).powf(2.0) {
        liquidation_price_for_a = 0.0;
    }
    if liquidation_price_for_b < 0.0 || liquidation_price_for_b < (upper_sqrt_price as f64 / Q64_RESOLUTION).powf(2.0) {
        liquidation_price_for_b = 0.0;
    }

    Ok(LiquidationPrices {
        lower: liquidation_price_for_a,
        upper: liquidation_price_for_b,
    })
}

/// Computes the liquidation prices for an existing position.
///
/// # Parameters
/// - `tick_lower_index`: The lower tick index of the position.
/// - `tick_upper_index`: The upper tick index of the position.
/// - `leftovers_a`: The amount of leftovers A in the position.
/// - `leftovers_a`: The amount of leftovers B in the position.
/// - `liquidity`: Liquidity of the position.
/// - `debt_a`: The amount of tokens A borrowed.
/// - `debt_b`: The amount of tokens B borrowed.
/// - `liquidation_threshold`: The liquidation threshold of the market.
///
/// # Returns
/// - `LiquidationPrices`: An object containing lower/upper liquidation prices.
#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn get_lp_position_liquidation_prices(
    tick_lower_index: i32,
    tick_upper_index: i32,
    liquidity: u128,
    leftovers_a: u64,
    leftovers_b: u64,
    debt_a: u64,
    debt_b: u64,
    liquidation_threshold: u32,
) -> Result<LiquidationPrices, CoreError> {
    if tick_lower_index >= tick_upper_index {
        return Err("Incorrect position tick index order: the lower tick must be less then the upper tick.");
    }

    if liquidation_threshold >= HUNDRED_PERCENT {
        return Err("Incorrect liquidation_threshold value.");
    }

    let lower_sqrt_price = tick_index_to_sqrt_price(tick_lower_index);
    let upper_sqrt_price = tick_index_to_sqrt_price(tick_upper_index);

    let liquidation_price_inside = compute_liquidation_prices_inside(
        lower_sqrt_price,
        upper_sqrt_price,
        liquidity,
        leftovers_a,
        leftovers_b,
        debt_a,
        debt_b,
        liquidation_threshold,
    )?;

    let liquidation_price_outside = compute_liquidation_prices_outside(
        lower_sqrt_price,
        upper_sqrt_price,
        liquidity,
        leftovers_a,
        leftovers_b,
        debt_a,
        debt_b,
        liquidation_threshold,
    )?;

    let lower_liquidation_price = if liquidation_price_inside.lower > 0.0 {
        liquidation_price_inside.lower
    } else {
        liquidation_price_outside.lower
    };

    let upper_liquidation_price = if liquidation_price_inside.upper > 0.0 {
        liquidation_price_inside.upper
    } else {
        liquidation_price_outside.upper
    };

    Ok(LiquidationPrices {
        lower: lower_liquidation_price,
        upper: upper_liquidation_price,
    })
}

#[derive(Debug, Copy, Clone, PartialEq)]
#[cfg_attr(feature = "wasm", wasm_expose)]
pub struct IncreaseLpPositionQuoteArgs {
    /// Collateral in token A or COMPUTED_AMOUNT.
    pub collateral_a: u64,
    /// Collateral in token B or COMPUTED_AMOUNT.
    pub collateral_b: u64,
    /// Amount to borrow in token A. Must be set to COMPUTED_AMOUNT if collateral_a is COMPUTED_AMOUNT.
    pub borrow_a: u64,
    /// Amount to borrow in token B. Must be set to COMPUTED_AMOUNT if collateral_b is COMPUTED_AMOUNT.
    pub borrow_b: u64,
    /// Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100).
    pub protocol_fee_rate: u16,
    /// Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100).
    pub protocol_fee_rate_on_collateral: u16,
    /// The swap fee rate of a pool denominated in 1e6.
    pub swap_fee_rate: u16,
    /// Current sqrt price.
    pub sqrt_price: u128,
    /// Position lower tick index.
    pub tick_lower_index: i32,
    /// Position upper tick index.
    pub tick_upper_index: i32,
    /// The liquidation threshold of the market.
    pub liquidation_threshold: u32,
}

#[derive(Debug, Copy, Clone, PartialEq)]
#[cfg_attr(feature = "wasm", wasm_expose)]
pub struct IncreaseLpPositionQuoteResult {
    pub collateral_a: u64,
    pub collateral_b: u64,
    pub borrow_a: u64,
    pub borrow_b: u64,
    pub total_a: u64,
    pub total_b: u64,
    pub swap_input: u64,
    pub swap_output: u64,
    pub swap_a_to_b: bool,
    pub protocol_fee_a: u64,
    pub protocol_fee_b: u64,
    pub liquidity: u128,
    pub leverage: f64,
    pub liquidation_lower_price: f64,
    pub liquidation_upper_price: f64,
}

#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn get_increase_lp_position_quote(args: IncreaseLpPositionQuoteArgs) -> Result<IncreaseLpPositionQuoteResult, CoreError> {
    let mut collateral_a = args.collateral_a;
    let mut collateral_b = args.collateral_b;
    let mut borrow_a = args.borrow_a;
    let mut borrow_b = args.borrow_b;
    let sqrt_price = args.sqrt_price;

    if args.tick_lower_index >= args.tick_upper_index {
        return Err("Incorrect position tick index order: the lower tick must be less than the upper tick.");
    }

    if collateral_a == COMPUTED_AMOUNT && collateral_b == COMPUTED_AMOUNT {
        return Err("Both collateral amounts can't be set to COMPUTED_AMOUNT");
    }

    let lower_sqrt_price = tick_index_to_sqrt_price(args.tick_lower_index);
    let upper_sqrt_price = tick_index_to_sqrt_price(args.tick_upper_index);

    if collateral_a == COMPUTED_AMOUNT {
        if sqrt_price <= lower_sqrt_price {
            return Err("sqrtPrice must be greater than lower_sqrt_price if collateral A is computed.");
        } else if sqrt_price < upper_sqrt_price {
            let liquidity = get_liquidity_from_amount_b(collateral_b + borrow_b, lower_sqrt_price, sqrt_price)?;
            let amount_a = get_amount_a_from_liquidity(liquidity, sqrt_price, upper_sqrt_price, false)?;
            collateral_a = ((amount_a as u128 * collateral_b as u128) / (collateral_b as u128 + borrow_b as u128)) as u64;
            borrow_a = amount_a - collateral_a;
        } else {
            collateral_a = 0;
            borrow_a = 0;
        }
    } else if collateral_b == COMPUTED_AMOUNT {
        if sqrt_price <= lower_sqrt_price {
            collateral_b = 0;
            borrow_b = 0;
        } else if sqrt_price < upper_sqrt_price {
            let liquidity = get_liquidity_from_amount_a(collateral_a + borrow_a, sqrt_price, upper_sqrt_price)?;
            let amount_b = get_amount_b_from_liquidity(liquidity, lower_sqrt_price, sqrt_price, false)?;
            collateral_b = ((amount_b as u128 * collateral_a as u128) / (collateral_a as u128 + borrow_a as u128)) as u64;
            borrow_b = amount_b - collateral_b;
        } else {
            return Err("sqrtPrice must be less than upper_sqrt_price if collateral B is computed.");
        }
    }

    let protocol_fee_a = calculate_tuna_protocol_fee(collateral_a, borrow_a, args.protocol_fee_rate_on_collateral, args.protocol_fee_rate);
    let provided_a = collateral_a + borrow_a - protocol_fee_a;

    let protocol_fee_b = calculate_tuna_protocol_fee(collateral_b, borrow_b, args.protocol_fee_rate_on_collateral, args.protocol_fee_rate);
    let provided_b = collateral_b + borrow_b - protocol_fee_b;

    let mut swap_input = 0;
    let mut swap_output = 0;
    let mut swap_a_to_b = false;
    let mut total_a = provided_a;
    let mut total_b = provided_b;

    if args.collateral_a != COMPUTED_AMOUNT && args.collateral_b != COMPUTED_AMOUNT {
        let position_ratio = position_ratio_x64(sqrt_price.into(), args.tick_lower_index, args.tick_upper_index);
        let ratio_a = position_ratio.ratio_a as f64 / Q64_RESOLUTION;
        let ratio_b = position_ratio.ratio_b as f64 / Q64_RESOLUTION;

        let price = (sqrt_price as f64 / Q64_RESOLUTION).powf(2.0);

        // Estimated total position size.
        let mut total = (provided_a as f64 * price + provided_b as f64) as u64;
        total_a = (total as f64 * ratio_a / price) as u64;
        total_b = (total as f64 * ratio_b) as u64;

        let mut fee_a = 0;
        let mut fee_b = 0;

        if total_a < provided_a {
            swap_input = provided_a - total_a;
            fee_a = swap_input - try_apply_swap_fee(swap_input, args.swap_fee_rate)?;
            swap_output = ((swap_input - fee_a) as f64 * price) as u64;
            swap_a_to_b = true;
        } else if total_b < provided_b {
            swap_input = provided_b - total_b;
            fee_b = swap_input - try_apply_swap_fee(swap_input, args.swap_fee_rate)?;
            swap_output = ((swap_input - fee_b) as f64 / price) as u64;
            swap_a_to_b = false;
        }

        // Recompute totals with applied swap fee.
        total = ((provided_a - fee_a) as f64 * price) as u64 + provided_b - fee_b;
        total_a = ((total as f64 * ratio_a) / price) as u64;
        total_b = (total as f64 * ratio_b) as u64;
    }

    let liquidity = get_liquidity_from_amounts(sqrt_price, lower_sqrt_price, upper_sqrt_price, total_a, total_b)?;
    let liquidation_prices = get_lp_position_liquidation_prices(
        args.tick_lower_index,
        args.tick_upper_index,
        liquidity,
        0,
        0,
        borrow_a,
        borrow_b,
        args.liquidation_threshold,
    )?;

    let leverage = compute_leverage(total_a, total_b, borrow_a, borrow_b, sqrt_price)?;

    Ok(IncreaseLpPositionQuoteResult {
        collateral_a,
        collateral_b,
        borrow_a,
        borrow_b,
        total_a,
        total_b,
        swap_input,
        swap_output,
        swap_a_to_b,
        protocol_fee_a,
        protocol_fee_b,
        liquidity,
        leverage,
        liquidation_lower_price: liquidation_prices.lower,
        liquidation_upper_price: liquidation_prices.upper,
    })
}

#[derive(Debug, Copy, Clone, PartialEq)]
#[cfg_attr(feature = "wasm", wasm_expose)]
pub struct RepayLpPositionDebtQuoteArgs {
    /** The position liquidity */
    pub liquidity: u128,
    /** The current debt of a position in token A. */
    pub debt_a: u64,
    /** The current debt of a position in token B. */
    pub debt_b: u64,
    /** The leftovers of a position in token A. */
    pub leftovers_a: u64,
    /** The leftovers of a position in token B. */
    pub leftovers_b: u64,
    /** Position lower tick index. */
    pub tick_lower_index: i32,
    /** Position upper tick index. */
    pub tick_upper_index: i32,
    /** The amount of token A to repay. */
    pub repay_a: u64,
    /** The amount of token B to repay. */
    pub repay_b: u64,
    /** Current sqrt price. */
    pub sqrt_price: u128,
    /** The liquidation threshold of the market. */
    pub liquidation_threshold: u32,
}

#[derive(Debug, Copy, Clone, PartialEq)]
#[cfg_attr(feature = "wasm", wasm_expose)]
pub struct RepayLpPositionDebtQuoteResult {
    pub debt_a: u64,
    pub debt_b: u64,
    pub leverage: f64,
    pub liquidation_lower_price: f64,
    pub liquidation_upper_price: f64,
}

#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn get_repay_lp_position_debt_quote(args: RepayLpPositionDebtQuoteArgs) -> Result<RepayLpPositionDebtQuoteResult, CoreError> {
    let mut debt_a = args.debt_a;
    let mut debt_b = args.debt_b;
    let repay_a = args.repay_a;
    let repay_b = args.repay_b;

    if args.liquidity == 0 {
        return Err("Position liquidity can't be zero.");
    }

    if debt_a < repay_a {
        return Err("Position debt A is less than the repaid amount.");
    }

    if debt_b < repay_b {
        return Err("Position debt b is less than the repaid amount.");
    }

    debt_a -= repay_a;
    debt_b -= repay_b;

    let liquidation_prices = get_lp_position_liquidation_prices(
        args.tick_lower_index,
        args.tick_upper_index,
        args.liquidity,
        args.leftovers_a,
        args.leftovers_b,
        debt_a,
        debt_b,
        args.liquidation_threshold,
    )?;

    let lower_sqrt_price = tick_index_to_sqrt_price(args.tick_lower_index);
    let upper_sqrt_price = tick_index_to_sqrt_price(args.tick_upper_index);

    let total = get_amounts_from_liquidity(args.liquidity, args.sqrt_price, lower_sqrt_price, upper_sqrt_price, false)?;
    let leverage = compute_leverage(total.a + args.leftovers_a, total.b + args.leftovers_b, debt_a, debt_b, args.sqrt_price)?;

    Ok(RepayLpPositionDebtQuoteResult {
        debt_a,
        debt_b,
        leverage,
        liquidation_lower_price: liquidation_prices.lower,
        liquidation_upper_price: liquidation_prices.upper,
    })
}

#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn compute_leverage(total_a: u64, total_b: u64, debt_a: u64, debt_b: u64, sqrt_price: u128) -> Result<f64, CoreError> {
    let price = sqrt_price_x64_to_price_x64(sqrt_price)?;

    let total = U64F64::from(total_a)
        .checked_mul(price)
        .ok_or(ARITHMETIC_OVERFLOW)?
        .to_num::<u64>()
        .checked_add(total_b)
        .ok_or(ARITHMETIC_OVERFLOW)?;

    let debt = U64F64::from(debt_a)
        .checked_mul(price)
        .ok_or(ARITHMETIC_OVERFLOW)?
        .to_num::<u64>()
        .checked_add(debt_b)
        .ok_or(ARITHMETIC_OVERFLOW)?;

    // We assume that the leverage of an empty position is always 1.0x.
    if total == 0 {
        return Ok(1.0);
    }

    if debt >= total {
        return Err("The debt is greater than the total size");
    }

    let leverage = total as f64 / (total - debt) as f64;
    Ok(leverage)
}

#[cfg(all(test, not(feature = "wasm")))]
mod tests {
    use crate::{
        get_increase_lp_position_quote, get_lp_position_liquidation_prices, get_repay_lp_position_debt_quote, IncreaseLpPositionQuoteArgs,
        IncreaseLpPositionQuoteResult, LiquidationPrices, RepayLpPositionDebtQuoteArgs, COMPUTED_AMOUNT, HUNDRED_PERCENT,
    };
    use fusionamm_core::{get_liquidity_from_amount_b, price_to_sqrt_price, price_to_tick_index, tick_index_to_sqrt_price};
    use once_cell::sync::Lazy;

    pub static TICK_LOWER_INDEX: Lazy<i32> = Lazy::new(|| price_to_tick_index(180.736, 6, 6));
    pub static TICK_UPPER_INDEX: Lazy<i32> = Lazy::new(|| price_to_tick_index(225.66, 6, 6));
    pub static SQRT_PRICE: Lazy<u128> = Lazy::new(|| price_to_sqrt_price(213.41, 6, 6));
    pub static LIQUIDITY: Lazy<u128> =
        Lazy::new(|| get_liquidity_from_amount_b(10000_000_000, tick_index_to_sqrt_price(*TICK_LOWER_INDEX), *SQRT_PRICE).unwrap());

    #[test]
    fn test_liquidation_price_outside_range_lower() {
        assert_eq!(
            get_lp_position_liquidation_prices(
                *TICK_LOWER_INDEX,
                *TICK_UPPER_INDEX,
                *LIQUIDITY,
                0,                          // leftovers_a
                0,                          // leftovers_b
                0,                          // debt_a
                9807_000_000,               // debt_b
                HUNDRED_PERCENT * 83 / 100  // liquidation_threshold
            ),
            Ok(LiquidationPrices {
                lower: 176.12815046153585,
                upper: 0.0
            })
        );
    }

    #[test]
    fn test_liquidation_price_outside_range_upper() {
        assert_eq!(
            get_lp_position_liquidation_prices(
                *TICK_LOWER_INDEX,
                *TICK_UPPER_INDEX,
                *LIQUIDITY,
                0,                          // leftovers_a
                0,                          // leftovers_b
                20_000_000,                 // debt_a
                0,                          // debt_b
                HUNDRED_PERCENT * 83 / 100  // liquidation_threshold
            ),
            Ok(LiquidationPrices {
                lower: 0.0,
                upper: 562.219410388
            })
        );
    }

    #[test]
    fn test_liquidation_price_outside_range_lower_and_upper() {
        assert_eq!(
            get_lp_position_liquidation_prices(
                *TICK_LOWER_INDEX,
                *TICK_UPPER_INDEX,
                *LIQUIDITY,
                0,                          // leftovers_a
                0,                          // leftovers_b
                10_000_000,                 // debt_a
                5000_000_000,               // debt_b
                HUNDRED_PERCENT * 83 / 100  // liquidation_threshold
            ),
            Ok(LiquidationPrices {
                lower: 109.45458168998225,
                upper: 624.4388207760001
            })
        );
    }

    #[test]
    fn test_liquidation_price_inside_range_lower() {
        assert_eq!(
            get_lp_position_liquidation_prices(
                *TICK_LOWER_INDEX,
                *TICK_UPPER_INDEX,
                *LIQUIDITY,
                0,                          // leftovers_a
                0,                          // leftovers_b
                0,                          // debt_a
                11000_000_000,              // debt_b
                HUNDRED_PERCENT * 83 / 100  // liquidation_threshold
            ),
            Ok(LiquidationPrices {
                lower: 204.60489065334323,
                upper: 0.0
            })
        );
    }

    #[test]
    fn test_liquidation_price_inside_range_upper() {
        assert_eq!(
            get_lp_position_liquidation_prices(
                *TICK_LOWER_INDEX,
                *TICK_UPPER_INDEX,
                *LIQUIDITY,
                0,                          // leftovers_a
                0,                          // leftovers_b
                51_000_000,                 // debt_a
                0,                          // debt_b
                HUNDRED_PERCENT * 83 / 100  // liquidation_threshold
            ),
            Ok(LiquidationPrices {
                lower: 0.0,
                upper: 220.16318077637644
            })
        );
    }

    #[test]
    fn test_liquidation_price_inside_range_lower_and_upper() {
        assert_eq!(
            get_lp_position_liquidation_prices(
                *TICK_LOWER_INDEX,
                *TICK_UPPER_INDEX,
                *LIQUIDITY,
                0,                          // leftovers_a
                0,                          // leftovers_b
                11_500_000,                 // debt_a
                8700_000_000,               // debt_b
                HUNDRED_PERCENT * 83 / 100  // liquidation_threshold
            ),
            Ok(LiquidationPrices {
                lower: 210.75514596082337,
                upper: 219.48595430071575
            })
        );
    }

    #[test]
    fn test_lp_increase_quote_collateral_a_and_b_provided() {
        assert_eq!(
            get_increase_lp_position_quote(IncreaseLpPositionQuoteArgs {
                collateral_a: 1000000,
                collateral_b: 1000000,
                borrow_a: 2000000,
                borrow_b: 2000000,
                tick_lower_index: price_to_tick_index(1.0, 1, 1),
                sqrt_price: price_to_sqrt_price(2.0, 1, 1),
                tick_upper_index: price_to_tick_index(4.0, 1, 1),
                protocol_fee_rate: (HUNDRED_PERCENT / 100) as u16,
                protocol_fee_rate_on_collateral: (HUNDRED_PERCENT / 100) as u16,
                swap_fee_rate: 10000, // 1%
                liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
            }),
            Ok(IncreaseLpPositionQuoteResult {
                collateral_a: 1000000,
                collateral_b: 1000000,
                borrow_a: 2000000,
                borrow_b: 2000000,
                total_a: 2223701,
                total_b: 4447744,
                swap_input: 742586,
                swap_output: 1470320,
                swap_a_to_b: true,
                protocol_fee_a: 30000,
                protocol_fee_b: 30000,
                liquidity: 10737803,
                leverage: 3.0724343435529677,
                liquidation_lower_price: 0.8143170288470588,
                liquidation_upper_price: 3.4020457909456225,
            })
        );
    }

    #[test]
    fn test_lp_increase_quote_collateral_a_provided() {
        assert_eq!(
            get_increase_lp_position_quote(IncreaseLpPositionQuoteArgs {
                collateral_a: 10000000,
                collateral_b: 0,
                borrow_a: 0,
                borrow_b: 0,
                tick_lower_index: price_to_tick_index(0.25, 6, 9),
                sqrt_price: price_to_sqrt_price(0.5, 6, 9),
                tick_upper_index: price_to_tick_index(1.0, 6, 9),
                protocol_fee_rate: (HUNDRED_PERCENT / 100) as u16,
                protocol_fee_rate_on_collateral: (HUNDRED_PERCENT / 100) as u16,
                swap_fee_rate: 10000, // 1%
                liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
            }),
            Ok(IncreaseLpPositionQuoteResult {
                collateral_a: 10000000,
                collateral_b: 0,
                borrow_a: 0,
                borrow_b: 0,
                total_a: 4925137,
                total_b: 2462680451,
                swap_input: 4950113,
                swap_output: 2450305500,
                swap_a_to_b: true,
                protocol_fee_a: 100000,
                protocol_fee_b: 0,
                liquidity: 376005629,
                leverage: 1.0,
                liquidation_lower_price: 0.0,
                liquidation_upper_price: 0.0,
            })
        );
    }

    #[test]
    fn test_lp_increase_quote_collateral_a_provided_b_computed() {
        assert_eq!(
            get_increase_lp_position_quote(IncreaseLpPositionQuoteArgs {
                collateral_a: 10000000,
                collateral_b: COMPUTED_AMOUNT,
                borrow_a: 2000000,
                borrow_b: COMPUTED_AMOUNT,
                tick_lower_index: price_to_tick_index(1.0, 1, 1),
                sqrt_price: price_to_sqrt_price(3.0, 1, 1),
                tick_upper_index: price_to_tick_index(4.0, 1, 1),
                protocol_fee_rate: 0,
                protocol_fee_rate_on_collateral: 0,
                swap_fee_rate: 0,
                liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
            }),
            Ok(IncreaseLpPositionQuoteResult {
                collateral_a: 10000000,
                collateral_b: 94660495,
                borrow_a: 2000000,
                borrow_b: 18932100,
                total_a: 12000000,
                total_b: 113592595,
                swap_input: 0,
                swap_output: 0,
                swap_a_to_b: false,
                protocol_fee_a: 0,
                protocol_fee_b: 0,
                liquidity: 155170370,
                leverage: 1.2,
                liquidation_lower_price: 0.30342990360419136,
                liquidation_upper_price: 54.925553349999994
            })
        );
    }

    #[test]
    fn test_lp_increase_quote_collateral_a_provided_b_computed_no_leverage() {
        assert_eq!(
            get_increase_lp_position_quote(IncreaseLpPositionQuoteArgs {
                collateral_a: 30000000000,
                collateral_b: COMPUTED_AMOUNT,
                borrow_a: 0,
                borrow_b: 0,
                tick_lower_index: price_to_tick_index(1.0, 1, 1),
                sqrt_price: price_to_sqrt_price(3.0, 1, 1),
                tick_upper_index: price_to_tick_index(4.0, 1, 1),
                protocol_fee_rate: 0,
                protocol_fee_rate_on_collateral: 0,
                swap_fee_rate: 0,
                liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
            }),
            Ok(IncreaseLpPositionQuoteResult {
                collateral_a: 30000000000,
                collateral_b: 283981489799,
                borrow_a: 0,
                borrow_b: 0,
                total_a: 30000000000,
                total_b: 283981489799,
                swap_input: 0,
                swap_output: 0,
                swap_a_to_b: false,
                protocol_fee_a: 0,
                protocol_fee_b: 0,
                liquidity: 387925929269,
                leverage: 1.0,
                liquidation_lower_price: 0.0,
                liquidation_upper_price: 0.0
            })
        );
    }

    #[test]
    fn test_lp_increase_quote_collateral_a_computed_b_provided() {
        assert_eq!(
            get_increase_lp_position_quote(IncreaseLpPositionQuoteArgs {
                collateral_a: COMPUTED_AMOUNT,
                collateral_b: 1000000,
                borrow_a: COMPUTED_AMOUNT,
                borrow_b: 2000000,
                tick_lower_index: price_to_tick_index(1.0, 1, 1),
                sqrt_price: price_to_sqrt_price(3.0, 1, 1),
                tick_upper_index: price_to_tick_index(4.0, 1, 1),
                protocol_fee_rate: 0,
                protocol_fee_rate_on_collateral: 0,
                swap_fee_rate: 0,
                liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
            }),
            Ok(IncreaseLpPositionQuoteResult {
                collateral_a: 105640,
                collateral_b: 1000000,
                borrow_a: 211282,
                borrow_b: 2000000,
                total_a: 316922,
                total_b: 3000000,
                swap_input: 0,
                swap_output: 0,
                swap_a_to_b: false,
                protocol_fee_a: 0,
                protocol_fee_b: 0,
                liquidity: 4098075,
                leverage: 3.000003796737843,
                liquidation_lower_price: 1.4306915613018771,
                liquidation_upper_price: 6.63182675287057
            })
        );
    }

    #[test]
    fn test_lp_increase_quote_collateral_a_computed_b_provided_no_leverage() {
        assert_eq!(
            get_increase_lp_position_quote(IncreaseLpPositionQuoteArgs {
                collateral_a: COMPUTED_AMOUNT,
                collateral_b: 30000000000,
                borrow_a: 0,
                borrow_b: 0,
                tick_lower_index: price_to_tick_index(1.0, 1, 1),
                sqrt_price: price_to_sqrt_price(3.0, 1, 1),
                tick_upper_index: price_to_tick_index(4.0, 1, 1),
                protocol_fee_rate: 0,
                protocol_fee_rate_on_collateral: 0,
                swap_fee_rate: 0,
                liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
            }),
            Ok(IncreaseLpPositionQuoteResult {
                collateral_a: 3169220644,
                collateral_b: 30000000000,
                borrow_a: 0,
                borrow_b: 0,
                total_a: 3169220644,
                total_b: 30000000000,
                swap_input: 0,
                swap_output: 0,
                swap_a_to_b: false,
                protocol_fee_a: 0,
                protocol_fee_b: 0,
                liquidity: 40980762112,
                leverage: 1.0,
                liquidation_lower_price: 0.0,
                liquidation_upper_price: 0.0
            })
        );
    }

    #[test]
    fn test_lp_increase_quote_one_sided_collateral_a_provided_b_computed() {
        assert_eq!(
            get_increase_lp_position_quote(IncreaseLpPositionQuoteArgs {
                collateral_a: 10000000,
                collateral_b: COMPUTED_AMOUNT,
                borrow_a: 2000000,
                borrow_b: COMPUTED_AMOUNT,
                tick_lower_index: price_to_tick_index(1.0, 1, 1),
                sqrt_price: price_to_sqrt_price(0.5, 1, 1),
                tick_upper_index: price_to_tick_index(4.0, 1, 1),
                protocol_fee_rate: 0,
                protocol_fee_rate_on_collateral: 0,
                swap_fee_rate: 0,
                liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
            }),
            Ok(IncreaseLpPositionQuoteResult {
                collateral_a: 10000000,
                collateral_b: 0,
                borrow_a: 2000000,
                borrow_b: 0,
                total_a: 12000000,
                total_b: 0,
                swap_input: 0,
                swap_output: 0,
                swap_a_to_b: false,
                protocol_fee_a: 0,
                protocol_fee_b: 0,
                liquidity: 24000764,
                leverage: 1.2,
                liquidation_lower_price: 0.0,
                liquidation_upper_price: 9.959682525
            })
        );
    }

    #[test]
    fn test_lp_increase_quote_one_sided_collateral_a_computed_b_provided() {
        assert_eq!(
            get_increase_lp_position_quote(IncreaseLpPositionQuoteArgs {
                collateral_a: COMPUTED_AMOUNT,
                collateral_b: 1000000,
                borrow_a: COMPUTED_AMOUNT,
                borrow_b: 2000000,
                tick_lower_index: price_to_tick_index(1.0, 1, 1),
                sqrt_price: price_to_sqrt_price(5.0, 1, 1),
                tick_upper_index: price_to_tick_index(4.0, 1, 1),
                protocol_fee_rate: 0,
                protocol_fee_rate_on_collateral: 0,
                swap_fee_rate: 0,
                liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
            }),
            Ok(IncreaseLpPositionQuoteResult {
                collateral_a: 0,
                collateral_b: 1000000,
                borrow_a: 0,
                borrow_b: 2000000,
                total_a: 0,
                total_b: 3000000,
                swap_input: 0,
                swap_output: 0,
                swap_a_to_b: false,
                protocol_fee_a: 0,
                protocol_fee_b: 0,
                liquidity: 3000191,
                leverage: 3.0,
                liquidation_lower_price: 1.8840617719481452,
                liquidation_upper_price: 0.0
            })
        );
    }

    #[test]
    fn test_lp_increase_quote_verify_liquidation_prices() {
        let quote = get_increase_lp_position_quote(IncreaseLpPositionQuoteArgs {
            collateral_a: 0,
            collateral_b: 1000_000_000,
            borrow_a: 3_000_000,
            borrow_b: 100_000_000,
            tick_lower_index: price_to_tick_index(180.736, 6, 6),
            sqrt_price: price_to_sqrt_price(213.41, 6, 6),
            tick_upper_index: price_to_tick_index(225.66, 6, 6),
            protocol_fee_rate: 500,
            protocol_fee_rate_on_collateral: 500,
            swap_fee_rate: 40,
            liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
        })
        .unwrap();

        assert_eq!(quote.liquidation_lower_price, 23.805241869982023);
        assert_eq!(quote.liquidation_upper_price, 451.38033819333333);
    }

    #[test]
    fn test_repay_debt_quote() {
        let quote = get_repay_lp_position_debt_quote(RepayLpPositionDebtQuoteArgs {
            repay_a: 1_000_000,
            repay_b: 30_000_000,
            liquidity: 1109671058,
            debt_a: 3_000_000,
            debt_b: 100_000_000,
            leftovers_a: 2,
            leftovers_b: 15,
            tick_lower_index: price_to_tick_index(180.736, 6, 6),
            sqrt_price: price_to_sqrt_price(213.41, 6, 6),
            tick_upper_index: price_to_tick_index(225.66, 6, 6),
            liquidation_threshold: HUNDRED_PERCENT * 83 / 100,
        })
        .unwrap();

        assert_eq!(quote.debt_a, 2_000_000);
        assert_eq!(quote.debt_b, 70_000_000);
        assert_eq!(quote.liquidation_lower_price, 13.459576327110664);
        assert_eq!(quote.liquidation_upper_price, 692.0710879340029);
    }
}
