#![allow(clippy::collapsible_else_if)]
#![allow(clippy::too_many_arguments)]

#[cfg(feature = "wasm")]
use fusionamm_macros::wasm_expose;
#[cfg(feature = "wasm")]
use serde::Serialize;
#[cfg(feature = "wasm")]
use serde_wasm_bindgen::Serializer;
#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::wasm_bindgen;
#[cfg(feature = "wasm")]
use wasm_bindgen::JsValue;

use crate::utils::fees;
use crate::{
    calculate_tuna_protocol_fee, HUNDRED_PERCENT, INVALID_ARGUMENTS, JUPITER_QUOTE_REQUEST_ERROR, JUPITER_SWAP_INSTRUCTIONS_REQUEST_ERROR, TOKEN_A,
    TOKEN_B,
};
use fusionamm_core::{
    sqrt_price_to_price, swap_quote_by_input_token, swap_quote_by_output_token, try_get_max_amount_with_slippage_tolerance,
    try_get_min_amount_with_slippage_tolerance, try_mul_div, CoreError, FusionPoolFacade, TickArrays, TokenPair,
};
use jup_ag::{PrioritizationFeeLamports, QuoteConfig, SwapMode, SwapRequest};
use libm::{ceil, round};
use solana_instruction::AccountMeta;
use solana_pubkey::Pubkey;

pub const DEFAULT_SLIPPAGE_TOLERANCE_BPS: u16 = 100;

#[cfg_attr(feature = "wasm", wasm_expose)]
pub struct SwapInstruction {
    pub data: Vec<u8>,
    pub accounts: Vec<AccountMeta>,
    pub address_lookup_table_addresses: Vec<Pubkey>,
}

#[cfg_attr(feature = "wasm", wasm_expose)]
pub struct IncreaseSpotPositionQuoteResult {
    /** Required collateral amount */
    pub collateral: u64,
    /** Required amount to borrow */
    pub borrow: u64,
    /** Estimated position size in the position token. */
    pub estimated_amount: u64,
    /** Swap input amount. */
    pub swap_input_amount: u64,
    /** Minimum swap output amount according to the provided slippage. */
    pub min_swap_output_amount: u64,
    /** Protocol fee in token A */
    pub protocol_fee_a: u64,
    /** Protocol fee in token B */
    pub protocol_fee_b: u64,
    /** Price impact in percents (100% = 1.0) */
    pub price_impact: f64,
    /** Optional jupiter swap instruction data and accounts. */
    pub jupiter_swap_ix: Option<SwapInstruction>,
}

/// Spot position increase quote
///
/// # Parameters
/// - `increase_amount`: Position total size in the collateral_token.
/// - `collateral_token`: Collateral token.
/// - `position_token`: Token of the position.
/// - `leverage`: Leverage (1.0 or higher).
/// - `slippage_tolerance_bps`: An optional slippage tolerance in basis points. Defaults to the global slippage tolerance if not provided.
/// - `protocol_fee_rate`: Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100).
/// - `protocol_fee_rate_on_collateral`: Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100).
/// - `mint_a`: Token A mint address
/// - `mint_b`: Token B mint address
/// - `fusion_pool`: Fusion pool.
/// - `tick_arrays`: Optional five tick arrays around the current pool price. If not provided, the quote will be calculated using the Jupiter Aggregator.
///
/// # Returns
/// - `IncreaseSpotPositionQuoteResult`: quote result
pub async fn get_increase_spot_position_quote(
    increase_amount: u64,
    collateral_token: u8,
    position_token: u8,
    leverage: f64,
    slippage_tolerance_bps: Option<u16>,
    protocol_fee_rate: u16,
    protocol_fee_rate_on_collateral: u16,
    mint_a: Pubkey,
    mint_b: Pubkey,
    fusion_pool: FusionPoolFacade,
    tick_arrays: Option<TickArrays>,
) -> Result<IncreaseSpotPositionQuoteResult, CoreError> {
    if collateral_token > TOKEN_B || position_token > TOKEN_B {
        return Err(INVALID_ARGUMENTS.into());
    }

    if leverage < 1.0 {
        return Err(INVALID_ARGUMENTS.into());
    }

    let borrow: u64;
    let mut collateral: u64;
    let mut estimated_amount: u64 = 0;
    let mut swap_input_amount: u64;
    let mut min_swap_output_amount: u64 = 0;
    let mut price_impact: f64 = 0.0;
    let mut jupiter_swap_ix: Option<SwapInstruction> = None;

    let price = sqrt_price_to_price(fusion_pool.sqrt_price.into(), 1, 1);
    let slippage_tolerance_bps = slippage_tolerance_bps.unwrap_or(DEFAULT_SLIPPAGE_TOLERANCE_BPS);

    let borrowed_token = if position_token == TOKEN_A { TOKEN_B } else { TOKEN_A };
    let swap_input_token_is_a = borrowed_token == TOKEN_A;

    if borrowed_token == collateral_token {
        borrow = ceil((increase_amount as f64 * (leverage - 1.0)) / leverage) as u64;
        collateral =
            increase_amount - fees::apply_swap_fee(fees::apply_tuna_protocol_fee(borrow, protocol_fee_rate, false)?, fusion_pool.fee_rate, false)?;
        collateral = fees::reverse_apply_swap_fee(collateral, fusion_pool.fee_rate, false)?;
        collateral = fees::reverse_apply_tuna_protocol_fee(collateral, protocol_fee_rate_on_collateral, false)?;

        swap_input_amount = collateral + borrow;
    } else {
        let position_to_borrowed_token_price = if collateral_token == TOKEN_A { price } else { 1.0 / price };
        let borrow_in_position_token = ceil((increase_amount as f64 * (leverage - 1.0)) / leverage);

        borrow = ceil(borrow_in_position_token * position_to_borrowed_token_price) as u64;

        let borrow_in_position_token_with_fees_applied = fees::apply_swap_fee(
            fees::apply_tuna_protocol_fee(borrow_in_position_token as u64, protocol_fee_rate, false)?,
            fusion_pool.fee_rate,
            false,
        )?;

        collateral = increase_amount - borrow_in_position_token_with_fees_applied;
        collateral = fees::reverse_apply_tuna_protocol_fee(collateral, protocol_fee_rate_on_collateral, false)?;

        swap_input_amount = borrow;
    }

    let protocol_fee = calculate_tuna_spot_position_protocol_fee(
        collateral_token,
        borrowed_token,
        collateral,
        borrow,
        protocol_fee_rate_on_collateral,
        protocol_fee_rate,
    );

    swap_input_amount -= if swap_input_token_is_a { protocol_fee.a } else { protocol_fee.b };

    if position_token == collateral_token {
        estimated_amount = collateral - if collateral_token == TOKEN_A { protocol_fee.a } else { protocol_fee.b };
    }

    if swap_input_amount > 0 {
        if let Some(tick_arrays) = tick_arrays {
            let quote = swap_quote_by_input_token(swap_input_amount, swap_input_token_is_a, 0, fusion_pool, tick_arrays, None, None)?;
            estimated_amount += quote.token_est_out;
            min_swap_output_amount = try_get_min_amount_with_slippage_tolerance(quote.token_est_out, slippage_tolerance_bps)?;
            let new_price = sqrt_price_to_price(quote.next_sqrt_price.into(), 1, 1);
            price_impact = (new_price / price - 1.0).abs();
        } else {
            let (input_mint, output_mint) = if swap_input_token_is_a { (mint_a, mint_b) } else { (mint_b, mint_a) };

            let quote = jupiter_swap_quote(input_mint, output_mint, swap_input_amount, Some(slippage_tolerance_bps as u64)).await?;

            estimated_amount += quote.out_amount;
            price_impact = quote.price_impact_pct;
            min_swap_output_amount = quote.other_amount_threshold;
            jupiter_swap_ix = Some(SwapInstruction {
                data: quote.instruction.data,
                accounts: quote.instruction.accounts,
                address_lookup_table_addresses: quote.instruction.address_lookup_table_addresses,
            });
        }
    }

    Ok(IncreaseSpotPositionQuoteResult {
        collateral,
        borrow,
        estimated_amount,
        swap_input_amount,
        min_swap_output_amount,
        protocol_fee_a: protocol_fee.a,
        protocol_fee_b: protocol_fee.b,
        price_impact,
        jupiter_swap_ix,
    })
}

/// Spot position increase quote
///
/// # Parameters
/// - `increase_amount`: Position total size in the collateral_token.
/// - `collateral_token`: Collateral token.
/// - `position_token`: Token of the position.
/// - `leverage`: Leverage (1.0 or higher).
/// - `slippage_tolerance_bps`: An optional slippage tolerance in basis points. Defaults to the global slippage tolerance if not provided.
/// - `protocol_fee_rate`: Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100).
/// - `protocol_fee_rate_on_collateral`: Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100).
/// - `mint_a`: Token A mint address
/// - `mint_b`: Token B mint address
/// - `fusion_pool`: Fusion pool.
/// - `tick_arrays`: Optional five tick arrays around the current pool price. If not provided, the quote will be calculated using the Jupiter Aggregator.
///
/// # Returns
/// - `IncreaseSpotPositionQuoteResult`: quote result
#[cfg(feature = "wasm")]
#[wasm_bindgen(js_name = "getIncreaseSpotPositionQuote", skip_jsdoc)]
pub async fn wasm_get_increase_spot_position_quote(
    increase_amount: u64,
    collateral_token: u8,
    position_token: u8,
    leverage: f64,
    slippage_tolerance_bps: Option<u16>,
    protocol_fee_rate: u16,
    protocol_fee_rate_on_collateral: u16,
    mint_a: Pubkey,
    mint_b: Pubkey,
    fusion_pool: FusionPoolFacade,
    tick_arrays: Option<TickArrays>,
) -> Result<JsValue, JsValue> {
    let result = get_increase_spot_position_quote(
        increase_amount,
        collateral_token,
        position_token,
        leverage,
        slippage_tolerance_bps,
        protocol_fee_rate,
        protocol_fee_rate_on_collateral,
        mint_a,
        mint_b,
        fusion_pool,
        tick_arrays,
    )
    .await
    .map_err(|e| JsValue::from_str(e))?;

    let serializer = Serializer::new().serialize_maps_as_objects(true);
    let js_value = result.serialize(&serializer).unwrap();

    Ok(js_value)
}

#[cfg_attr(feature = "wasm", wasm_expose)]
pub struct DecreaseSpotPositionQuoteResult {
    /** Position decrease percentage */
    pub decrease_percent: u32,
    /** The maximum acceptable swap input amount for position decrease according to the provided slippage
     * (if collateral_token == position_token) OR the minimum swap output amount (if collateral_token != position_token).
     */
    pub required_swap_amount: u64,
    /** Estimated total amount of the adjusted position. */
    pub estimated_amount: u64,
    /** Estimated value of a debt that will be repaid. */
    pub estimated_payable_debt: u64,
    /** Estimated collateral that will be withdrawn from the position. */
    pub estimated_collateral_to_be_withdrawn: u64,
    /** Price impact in percents (100% = 1.0) */
    pub price_impact: f64,
    /** Optional jupiter swap instruction data and accounts. */
    pub jupiter_swap_ix: Option<SwapInstruction>,
}

/// Spot position decrease quote
///
/// # Parameters
/// - `decrease_amount`: Position total decrease size in the collateral_token.
/// - `collateral_token`: Collateral token.
/// - `leverage`: Leverage (1.0 or higher).
/// - `slippage_tolerance_bps`: An optional slippage tolerance in basis points. Defaults to the global slippage tolerance if not provided.
/// - `position_token`: Token of the existing position.
/// - `position_amount`: Existing position amount in the position_token.
/// - `position_debt`: Existing position debt in the token opposite to the position_token.
/// - `fusion_pool`: Fusion pool.
/// - `tick_arrays`: Optional five tick arrays around the current pool price. If not provided, the quote will be calculated using the Jupiter Aggregator.
///
/// # Returns
/// - `DecreaseSpotPositionQuoteResult`: quote result
pub async fn get_decrease_spot_position_quote(
    decrease_amount: u64,
    collateral_token: u8,
    leverage: f64,
    slippage_tolerance_bps: Option<u16>,
    position_token: u8,
    position_amount: u64,
    position_debt: u64,
    mint_a: Pubkey,
    mint_b: Pubkey,
    fusion_pool: FusionPoolFacade,
    tick_arrays: Option<TickArrays>,
) -> Result<DecreaseSpotPositionQuoteResult, CoreError> {
    if collateral_token > TOKEN_B || position_token > TOKEN_B {
        return Err(INVALID_ARGUMENTS.into());
    }

    if leverage < 1.0 {
        return Err(INVALID_ARGUMENTS.into());
    }

    let price = sqrt_price_to_price(fusion_pool.sqrt_price.into(), 1, 1);
    let position_to_borrowed_token_price = if position_token == TOKEN_A { price } else { 1.0 / price };
    let borrowed_token = if position_token == TOKEN_A { TOKEN_B } else { TOKEN_A };
    let slippage_tolerance_bps = slippage_tolerance_bps.unwrap_or(DEFAULT_SLIPPAGE_TOLERANCE_BPS);

    let mut required_swap_amount: u64 = 0;
    let mut price_impact = 0.0;
    let mut jupiter_swap_ix: Option<SwapInstruction> = None;

    let mut decrease_amount_in_position_token = if collateral_token == position_token {
        decrease_amount
    } else {
        round(decrease_amount as f64 / position_to_borrowed_token_price) as u64
    };

    decrease_amount_in_position_token = position_amount.min(decrease_amount_in_position_token);

    let decrease_percent = ((decrease_amount_in_position_token * HUNDRED_PERCENT as u64 / position_amount) as u32).min(HUNDRED_PERCENT);

    let estimated_amount = position_amount * (HUNDRED_PERCENT - decrease_percent) as u64 / HUNDRED_PERCENT as u64;
    let estimated_payable_debt = try_mul_div(position_debt, decrease_percent as u128, HUNDRED_PERCENT as u128, true)?;
    let mut estimated_collateral_to_be_withdrawn = 0;

    if let Some(tick_arrays) = tick_arrays {
        let mut next_sqrt_price = fusion_pool.sqrt_price;

        if collateral_token == position_token {
            if position_debt > 0 {
                let amount_out = position_debt * decrease_percent as u64 / HUNDRED_PERCENT as u64;
                let swap = swap_quote_by_output_token(amount_out, borrowed_token == TOKEN_A, 0, fusion_pool, tick_arrays, None, None)?;
                next_sqrt_price = swap.next_sqrt_price;
                required_swap_amount = try_get_max_amount_with_slippage_tolerance(swap.token_est_in, slippage_tolerance_bps)?;
                estimated_collateral_to_be_withdrawn = position_amount.saturating_sub(swap.token_est_in).saturating_sub(estimated_amount);
            } else {
                estimated_collateral_to_be_withdrawn = position_amount - estimated_amount;
            }
        } else {
            let amount_in = position_amount - estimated_amount;
            let swap = swap_quote_by_input_token(amount_in, position_token == TOKEN_A, 0, fusion_pool, tick_arrays, None, None)?;
            next_sqrt_price = swap.next_sqrt_price;
            required_swap_amount = try_get_min_amount_with_slippage_tolerance(swap.token_est_out, slippage_tolerance_bps)?;
            estimated_collateral_to_be_withdrawn = swap.token_est_out.saturating_sub(estimated_payable_debt);
        }

        let new_price = sqrt_price_to_price(next_sqrt_price.into(), 1, 1);
        price_impact = (new_price / price - 1.0).abs();
    } else {
        let (input_mint, output_mint) = if position_token == TOKEN_A { (mint_a, mint_b) } else { (mint_b, mint_a) };

        let amount_in = if collateral_token == position_token {
            if position_debt > 0 {
                let mut amount_in = if position_token == TOKEN_A {
                    (position_debt as f64 / price) as u64
                } else {
                    (position_debt as f64 * price) as u64
                };
                amount_in = try_get_max_amount_with_slippage_tolerance(amount_in, slippage_tolerance_bps)?;
                amount_in = amount_in.min(position_amount);
                estimated_collateral_to_be_withdrawn = position_amount.saturating_sub(amount_in).saturating_sub(estimated_amount);
                amount_in
            } else {
                estimated_collateral_to_be_withdrawn = position_amount - estimated_amount;
                0
            }
        } else {
            position_amount - estimated_amount
        };

        if amount_in > 0 {
            let quote = jupiter_swap_quote(input_mint, output_mint, amount_in, Some(slippage_tolerance_bps as u64)).await?;

            price_impact = quote.price_impact_pct;
            required_swap_amount = quote.other_amount_threshold;
            jupiter_swap_ix = Some(SwapInstruction {
                data: quote.instruction.data,
                accounts: quote.instruction.accounts,
                address_lookup_table_addresses: quote.instruction.address_lookup_table_addresses,
            });

            if collateral_token != position_token {
                estimated_collateral_to_be_withdrawn = quote.out_amount.saturating_sub(estimated_payable_debt);
            }
        }
    }

    Ok(DecreaseSpotPositionQuoteResult {
        decrease_percent,
        estimated_payable_debt,
        estimated_collateral_to_be_withdrawn,
        required_swap_amount,
        estimated_amount,
        price_impact,
        jupiter_swap_ix,
    })
}

/// Spot position decrease quote
///
/// # Parameters
/// - `decrease_amount`: Position total decrease size in the collateral_token.
/// - `collateral_token`: Collateral token.
/// - `leverage`: Leverage (1.0 or higher).
/// - `slippage_tolerance_bps`: An optional slippage tolerance in basis points. Defaults to the global slippage tolerance if not provided.
/// - `position_token`: Token of the existing position.
/// - `position_amount`: Existing position amount in the position_token.
/// - `position_debt`: Existing position debt in the token opposite to the position_token.
/// - `fusion_pool`: Fusion pool.
/// - `tick_arrays`: Optional five tick arrays around the current pool price. If not provided, the quote will be calculated using the Jupiter Aggregator.
///
/// # Returns
/// - `DecreaseSpotPositionQuoteResult`: quote result
#[cfg(feature = "wasm")]
#[wasm_bindgen(js_name = "getDecreaseSpotPositionQuote", skip_jsdoc)]
pub async fn wasm_get_decrease_spot_position_quote(
    decrease_amount: u64,
    collateral_token: u8,
    leverage: f64,
    slippage_tolerance_bps: Option<u16>,
    position_token: u8,
    position_amount: u64,
    position_debt: u64,
    mint_a: Pubkey,
    mint_b: Pubkey,
    fusion_pool: FusionPoolFacade,
    tick_arrays: Option<TickArrays>,
) -> Result<JsValue, JsValue> {
    let result = get_decrease_spot_position_quote(
        decrease_amount,
        collateral_token,
        leverage,
        slippage_tolerance_bps,
        position_token,
        position_amount,
        position_debt,
        mint_a,
        mint_b,
        fusion_pool,
        tick_arrays,
    )
    .await
    .map_err(|e| JsValue::from_str(e))?;

    let serializer = Serializer::new().serialize_maps_as_objects(true);
    let js_value = result.serialize(&serializer).unwrap();

    Ok(js_value)
}

/// Returns the liquidation price
///
/// # Parameters
/// - `position_token`: Token of the position
/// - `amount`: Position total size
/// - `debt`: Position total debt
/// - `liquidation_threshold`: Liquidation threshold of a market
///
/// # Returns
/// - `f64`: Decimal liquidation price
#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn get_spot_position_liquidation_price(position_token: u8, amount: u64, debt: u64, liquidation_threshold: u32) -> Result<f64, CoreError> {
    if liquidation_threshold >= HUNDRED_PERCENT {
        return Err(INVALID_ARGUMENTS);
    }

    if debt == 0 || amount == 0 {
        return Ok(0.0);
    }

    let liquidation_threshold_f = liquidation_threshold as f64 / HUNDRED_PERCENT as f64;

    if position_token == TOKEN_A {
        Ok(debt as f64 / (amount as f64 * liquidation_threshold_f))
    } else {
        Ok((amount as f64 * liquidation_threshold_f) / debt as f64)
    }
}

/// Calculates the maximum tradable amount in the collateral token.
///
/// # Parameters
/// - `collateral_token`: Collateral token.
/// - `available_balance`: Available wallet balance in the collateral_token.
/// - `leverage`: Leverage (1.0 or higher).
/// - `position_token`: Token of the existing position. Should be set to new_position_token if position_amount is zero.
/// - `position_amount`: Existing position amount in the position_token.
/// - `protocol_fee_rate`: Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100).
/// - `protocol_fee_rate_on_collateral`: Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100).
/// - `fusion_pool`: Fusion pool.
/// - `increase`: true if increasing the position
///
/// # Returns
/// - `u64`: the maximum tradable amount
#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn get_tradable_amount(
    collateral_token: u8,
    available_balance: u64,
    leverage: f64,
    position_token: u8,
    position_amount: u64,
    protocol_fee_rate: u16,
    protocol_fee_rate_on_collateral: u16,
    fusion_pool: FusionPoolFacade,
    increase: bool,
) -> Result<u64, CoreError> {
    if collateral_token > TOKEN_B || position_token > TOKEN_B {
        return Err(INVALID_ARGUMENTS.into());
    }

    if leverage < 1.0 {
        return Err(INVALID_ARGUMENTS.into());
    }

    // T = C⋅Fc⋅Fs + B⋅Fb⋅Fs, where: Fc/Fb/Fs - collateral/borrow/swap fee multiplier
    // B = T⋅(L - 1) / L
    // => T = C⋅Fc⋅Fs / (1 - Fb⋅Fs⋅(L - 1) / L)
    let add_leverage = |collateral: u64| -> Result<u64, CoreError> {
        let mut collateral = fees::apply_tuna_protocol_fee(collateral, protocol_fee_rate_on_collateral, false)?;
        if collateral_token != position_token {
            collateral = fees::apply_swap_fee(collateral, fusion_pool.fee_rate, false)?;
        }

        let fee_multiplier = (1.0 - protocol_fee_rate as f64 / HUNDRED_PERCENT as f64) * (1.0 - fusion_pool.fee_rate as f64 / 1_000_000.0);
        let total = (collateral as f64 / (1.0 - (fee_multiplier * (leverage - 1.0)) / leverage)) as u64;
        Ok(total)
    };

    let available_to_trade = if increase {
        add_leverage(available_balance)?
    } else {
        let price = sqrt_price_to_price(fusion_pool.sqrt_price.into(), 1, 1);
        let position_to_opposite_token_price = if position_token == TOKEN_A { price } else { 1.0 / price };

        if collateral_token == position_token {
            position_amount
        } else {
            round(position_amount as f64 * position_to_opposite_token_price) as u64
        }
    };

    Ok(available_to_trade)
}

struct JupiterSwapResult {
    pub instruction: SwapInstruction,
    pub out_amount: u64,
    pub other_amount_threshold: u64,
    pub price_impact_pct: f64,
}

async fn jupiter_swap_quote(input_mint: Pubkey, output_mint: Pubkey, amount: u64, slippage_bps: Option<u64>) -> Result<JupiterSwapResult, CoreError> {
    let quote_config = QuoteConfig {
        slippage_bps,
        swap_mode: Some(SwapMode::ExactIn),
        dexes: None,
        exclude_dexes: None,
        only_direct_routes: false,
        as_legacy_transaction: None,
        platform_fee_bps: None,
        max_accounts: None,
    };

    let quote = jup_ag::quote(input_mint, output_mint, amount, quote_config)
        .await
        .map_err(|_| JUPITER_QUOTE_REQUEST_ERROR)?;

    #[allow(deprecated)]
    let swap_request = SwapRequest {
        user_public_key: Default::default(),
        wrap_and_unwrap_sol: None,
        use_shared_accounts: Some(true),
        fee_account: None,
        compute_unit_price_micro_lamports: None,
        prioritization_fee_lamports: PrioritizationFeeLamports::Auto,
        as_legacy_transaction: None,
        use_token_ledger: None,
        destination_token_account: None,
        quote_response: quote.clone(),
    };

    let swap_response = jup_ag::swap_instructions(swap_request)
        .await
        .map_err(|_| JUPITER_SWAP_INSTRUCTIONS_REQUEST_ERROR)?;

    Ok(JupiterSwapResult {
        instruction: SwapInstruction {
            data: swap_response.swap_instruction.data,
            accounts: swap_response.swap_instruction.accounts,
            address_lookup_table_addresses: swap_response.address_lookup_table_addresses,
        },
        out_amount: quote.out_amount,
        other_amount_threshold: quote.other_amount_threshold,
        price_impact_pct: quote.price_impact_pct,
    })
}

#[cfg_attr(feature = "wasm", wasm_expose)]
pub fn calculate_tuna_spot_position_protocol_fee(
    collateral_token: u8,
    borrowed_token: u8,
    collateral: u64,
    borrow: u64,
    protocol_fee_rate_on_collateral: u16,
    protocol_fee_rate: u16,
) -> TokenPair {
    let collateral_a = if collateral_token == TOKEN_A { collateral } else { 0 };
    let collateral_b = if collateral_token == TOKEN_B { collateral } else { 0 };
    let borrow_a = if borrowed_token == TOKEN_A { borrow } else { 0 };
    let borrow_b = if borrowed_token == TOKEN_B { borrow } else { 0 };

    let protocol_fee_a = calculate_tuna_protocol_fee(collateral_a, borrow_a, protocol_fee_rate_on_collateral, protocol_fee_rate);
    let protocol_fee_b = calculate_tuna_protocol_fee(collateral_b, borrow_b, protocol_fee_rate_on_collateral, protocol_fee_rate);

    TokenPair {
        a: protocol_fee_a,
        b: protocol_fee_b,
    }
}

#[cfg(all(test, not(feature = "wasm")))]
mod tests {
    use super::*;
    use crate::assert_approx_eq;
    use fusionamm_core::{
        get_tick_array_start_tick_index, price_to_sqrt_price, sqrt_price_to_tick_index, TickArrayFacade, TickFacade, TICK_ARRAY_SIZE,
    };
    use solana_pubkey::pubkey;

    const NATIVE_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
    const TUNA_MINT: Pubkey = pubkey!("TUNAfXDZEdQizTMTh3uEvNvYqJmqFHZbEJt8joP4cyx");

    fn test_fusion_pool(sqrt_price: u128) -> FusionPoolFacade {
        let tick_current_index = sqrt_price_to_tick_index(sqrt_price);
        FusionPoolFacade {
            tick_current_index,
            fee_rate: 3000,
            liquidity: 10000000000000,
            sqrt_price,
            tick_spacing: 2,
            ..FusionPoolFacade::default()
        }
    }

    fn test_tick(liquidity_net: i128) -> TickFacade {
        TickFacade {
            initialized: true,
            liquidity_net,
            ..TickFacade::default()
        }
    }

    fn test_tick_array(start_tick_index: i32) -> TickArrayFacade {
        TickArrayFacade {
            start_tick_index,
            ticks: [test_tick(0); TICK_ARRAY_SIZE],
        }
    }

    fn test_tick_arrays(fusion_pool: FusionPoolFacade) -> TickArrays {
        let tick_spacing = fusion_pool.tick_spacing;
        let tick_current_index = sqrt_price_to_tick_index(fusion_pool.sqrt_price);
        let tick_array_start_index = get_tick_array_start_tick_index(tick_current_index, tick_spacing);

        [
            test_tick_array(tick_array_start_index),
            test_tick_array(tick_array_start_index + TICK_ARRAY_SIZE as i32 * tick_spacing as i32),
            test_tick_array(tick_array_start_index + TICK_ARRAY_SIZE as i32 * tick_spacing as i32 * 2),
            test_tick_array(tick_array_start_index - TICK_ARRAY_SIZE as i32 * tick_spacing as i32),
            test_tick_array(tick_array_start_index - TICK_ARRAY_SIZE as i32 * tick_spacing as i32 * 2),
        ]
        .into()
    }

    #[test]
    fn test_get_liquidation_price() {
        assert_eq!(get_spot_position_liquidation_price(TOKEN_A, 5, 0, HUNDRED_PERCENT * 85 / 100), Ok(0.0));
        assert_eq!(get_spot_position_liquidation_price(TOKEN_A, 0, 5, HUNDRED_PERCENT * 85 / 100), Ok(0.0));
        assert_eq!(get_spot_position_liquidation_price(TOKEN_A, 5, 800, HUNDRED_PERCENT * 85 / 100), Ok(188.23529411764707));
        assert_eq!(get_spot_position_liquidation_price(TOKEN_B, 1000, 4, HUNDRED_PERCENT * 85 / 100), Ok(212.5));
    }

    #[tokio::test]
    async fn increase_long_position_providing_token_a() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);

        let quote = get_increase_spot_position_quote(
            5_000_000_000,
            TOKEN_A,
            TOKEN_A,
            5.0,
            Some(0),
            (HUNDRED_PERCENT / 100) as u16,
            (HUNDRED_PERCENT / 200) as u16,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.collateral, 1057165829);
        assert_eq!(quote.borrow, 800000000);
        assert_eq!(quote.min_swap_output_amount, 3_947_423_011);
        assert_eq!(quote.estimated_amount, 4_999_303_011);
        assert_eq!(quote.protocol_fee_a, 5285829);
        assert_eq!(quote.protocol_fee_b, 8000000);
        assert_eq!(quote.price_impact, 0.00035316176257027543);
        assert_approx_eq!(quote.estimated_amount as f64 / (quote.estimated_amount as f64 - (quote.borrow as f64 * 1000.0) / 200.0), 5.0, 0.1);
    }

    #[tokio::test]
    async fn increase_long_position_providing_token_b() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);

        let quote = get_increase_spot_position_quote(
            5000_000_000,
            TOKEN_B,
            TOKEN_A,
            5.0,
            Some(0),
            (HUNDRED_PERCENT / 100) as u16,
            (HUNDRED_PERCENT / 200) as u16,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.collateral, 1060346869);
        assert_eq!(quote.borrow, 4000000000);
        assert_eq!(quote.estimated_amount, 24_972_080_293);
        assert_eq!(quote.protocol_fee_a, 0);
        assert_eq!(quote.protocol_fee_b, 45301734);
        assert_eq!(quote.price_impact, 0.0022373179716579372);
        assert_approx_eq!(quote.estimated_amount as f64 / (quote.estimated_amount as f64 - (quote.borrow as f64 * 1000.0) / 200.0), 5.0, 0.1);
    }

    #[tokio::test]
    async fn increase_short_position_providing_a() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);

        let quote = get_increase_spot_position_quote(
            5_000_000_000,
            TOKEN_A,
            TOKEN_B,
            5.0,
            Some(0),
            (HUNDRED_PERCENT / 100) as u16,
            (HUNDRED_PERCENT / 200) as u16,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.collateral, 1060346869);
        assert_eq!(quote.borrow, 4000000000);
        assert_eq!(quote.estimated_amount, 999_776_441);
        assert_eq!(quote.protocol_fee_a, 45301734);
        assert_eq!(quote.protocol_fee_b, 0);
        assert_eq!(quote.price_impact, 0.0004470636400017991);
        assert_approx_eq!(quote.estimated_amount as f64 / (quote.estimated_amount as f64 - (quote.borrow as f64 / 1000.0) * 200.0), 5.0, 0.1);
    }

    #[tokio::test]
    async fn increase_short_position_providing_b() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);

        let quote = get_increase_spot_position_quote(
            5000_000_000,
            TOKEN_B,
            TOKEN_B,
            5.0,
            Some(0),
            (HUNDRED_PERCENT / 100) as u16,
            (HUNDRED_PERCENT / 200) as u16,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.collateral, 1057165829);
        assert_eq!(quote.borrow, 20000000000);
        assert_eq!(quote.estimated_amount, 4996_517_564);
        assert_eq!(quote.protocol_fee_a, 200000000);
        assert_eq!(quote.protocol_fee_b, 5285829);
        assert_eq!(quote.price_impact, 0.0017633175413067637);
        assert_approx_eq!(quote.estimated_amount as f64 / (quote.estimated_amount as f64 - (quote.borrow as f64 / 1000.0) * 200.0), 5.0, 0.1);
    }

    #[tokio::test]
    async fn increase_quote_with_slippage() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);

        // with slippage 10%
        let quote = get_increase_spot_position_quote(
            200_000,
            TOKEN_B,
            TOKEN_A,
            5.0,
            Some(1000),
            0,
            0,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();
        assert_eq!(quote.min_swap_output_amount, 899_994);

        // without slippage
        let quote = get_increase_spot_position_quote(
            200_000,
            TOKEN_B,
            TOKEN_A,
            5.0,
            Some(0),
            0,
            0,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();
        assert_eq!(quote.min_swap_output_amount, 999_994);
    }

    #[tokio::test]
    async fn decrease_non_leveraged_long_position_providing_a() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);

        let quote = get_decrease_spot_position_quote(
            1_000_000_000,
            TOKEN_A,
            1.0,
            Some(0),
            TOKEN_A,
            5_000_000_000, // A
            0,             // B
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.decrease_percent, 200000);
        assert_eq!(quote.estimated_amount, 4_000_000_000);
        assert_eq!(quote.estimated_payable_debt, 0);
        assert_eq!(quote.estimated_collateral_to_be_withdrawn, 1_000_000_000);
        assert_eq!(quote.price_impact, 0.0);
    }

    #[tokio::test]
    async fn decrease_non_leveraged_long_position_providing_b() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);

        let quote = get_decrease_spot_position_quote(
            200_000_000,
            TOKEN_B,
            1.0,
            Some(0),
            TOKEN_A,
            5_000_000_000, // A
            0,             // B
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.decrease_percent, 200000);
        assert_eq!(quote.estimated_amount, 4_000_000_000);
        assert_eq!(quote.estimated_payable_debt, 0);
        assert_eq!(quote.estimated_collateral_to_be_withdrawn, 199_391_108);
        assert_eq!(quote.price_impact, 0.00008916842709072448);
    }

    #[tokio::test]
    async fn decrease_long_position_providing_a() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);

        let quote = get_decrease_spot_position_quote(
            1_000_000_000,
            TOKEN_A,
            5.0,
            Some(0),
            TOKEN_A,
            5_000_000_000, // A
            800_000_000,   // B
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.decrease_percent, 200000);
        assert_eq!(quote.estimated_amount, 4_000_000_000);
        assert_eq!(quote.estimated_payable_debt, 160_000_000);
        assert_eq!(quote.estimated_collateral_to_be_withdrawn, 197_564_069);
        assert_eq!(quote.price_impact, 0.00007155289528004705);

        let quote = get_decrease_spot_position_quote(
            6_000_000_000,
            TOKEN_A,
            5.0,
            Some(0),
            TOKEN_A,
            5_000_000_000, // A
            800_000_000,   // B
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.decrease_percent, HUNDRED_PERCENT);
        assert_eq!(quote.estimated_amount, 0);
    }

    #[tokio::test]
    async fn decrease_long_position_providing_b() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);

        let quote = get_decrease_spot_position_quote(
            200_000_000,
            TOKEN_B,
            5.0,
            Some(0),
            TOKEN_A,
            5_000_000_000, // A
            800_000_000,   // B
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.estimated_amount, 4000000000);
        assert_eq!(quote.decrease_percent, 200000);
        assert_eq!(quote.estimated_payable_debt, 160_000_000);
        assert_eq!(quote.estimated_collateral_to_be_withdrawn, 39_391_108);
        assert_eq!(quote.price_impact, 0.00008916842709072448);

        let quote = get_decrease_spot_position_quote(
            1200_000_000,
            TOKEN_B,
            5.0,
            Some(0),
            TOKEN_A,
            5_000_000_000, // A
            800_000_000,   // B
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            Some(test_tick_arrays(fusion_pool)),
        )
        .await
        .unwrap();

        assert_eq!(quote.estimated_amount, 0);
        assert_eq!(quote.decrease_percent, HUNDRED_PERCENT);
    }

    #[tokio::test]
    async fn tradable_amount_for_1x_long_position_providing_b() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);
        let tick_arrays = Some(test_tick_arrays(fusion_pool));

        let collateral_token = TOKEN_B;
        let position_token = TOKEN_A;
        let leverage = 1.0;
        let protocol_fee_rate = (HUNDRED_PERCENT / 100) as u16;
        let protocol_fee_rate_on_collateral = (HUNDRED_PERCENT / 200) as u16;
        let available_balance = 200_000_000;

        let tradable_amount = get_tradable_amount(
            collateral_token,
            available_balance,
            leverage,
            position_token,
            0,
            protocol_fee_rate,
            protocol_fee_rate_on_collateral,
            fusion_pool,
            true,
        )
        .unwrap();
        assert_eq!(tradable_amount, 198403000);

        let quote = get_increase_spot_position_quote(
            tradable_amount,
            collateral_token,
            position_token,
            leverage,
            Some(0),
            protocol_fee_rate,
            protocol_fee_rate_on_collateral,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            tick_arrays,
        )
        .await
        .unwrap();
        assert_eq!(quote.collateral, available_balance);
    }

    #[tokio::test]
    async fn tradable_amount_for_5x_long_position_providing_b() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);
        let tick_arrays = Some(test_tick_arrays(fusion_pool));

        let collateral_token = TOKEN_B;
        let position_token = TOKEN_A;
        let leverage = 5.0;
        let protocol_fee_rate = (HUNDRED_PERCENT / 100) as u16;
        let protocol_fee_rate_on_collateral = (HUNDRED_PERCENT / 200) as u16;
        let available_balance = 10_000_000;

        let tradable_amount = get_tradable_amount(
            collateral_token,
            available_balance,
            leverage,
            position_token,
            0,
            protocol_fee_rate,
            protocol_fee_rate_on_collateral,
            fusion_pool,
            true,
        )
        .unwrap();
        assert_eq!(tradable_amount, 47154380);

        let quote = get_increase_spot_position_quote(
            tradable_amount,
            collateral_token,
            position_token,
            leverage,
            Some(0),
            protocol_fee_rate,
            protocol_fee_rate_on_collateral,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            tick_arrays,
        )
        .await
        .unwrap();
        // TODO: fix precision error
        assert_eq!(quote.collateral, available_balance + 1);
    }

    #[tokio::test]
    async fn tradable_amount_for_5x_long_position_providing_a() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);
        let tick_arrays = Some(test_tick_arrays(fusion_pool));

        let collateral_token = TOKEN_A;
        let position_token = TOKEN_A;
        let leverage = 5.0;
        let protocol_fee_rate = (HUNDRED_PERCENT / 100) as u16;
        let protocol_fee_rate_on_collateral = (HUNDRED_PERCENT / 200) as u16;
        let available_balance = 1_000_000_000;

        let tradable_amount = get_tradable_amount(
            collateral_token,
            available_balance,
            leverage,
            position_token,
            0,
            protocol_fee_rate,
            protocol_fee_rate_on_collateral,
            fusion_pool,
            true,
        )
        .unwrap();
        assert_eq!(tradable_amount, 4729626953);

        let quote = get_increase_spot_position_quote(
            tradable_amount,
            collateral_token,
            position_token,
            leverage,
            Some(0),
            protocol_fee_rate,
            protocol_fee_rate_on_collateral,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            tick_arrays,
        )
        .await
        .unwrap();
        assert_eq!(quote.collateral, available_balance);
        //assert_eq!(quote.estimated_amount, tradable_amount);
    }

    #[tokio::test]
    async fn tradable_amount_for_5x_short_position_providing_b() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);
        let tick_arrays = Some(test_tick_arrays(fusion_pool));

        let collateral_token = TOKEN_B;
        let position_token = TOKEN_B;
        let leverage = 5.0;
        let protocol_fee_rate = (HUNDRED_PERCENT / 100) as u16;
        let protocol_fee_rate_on_collateral = (HUNDRED_PERCENT / 200) as u16;
        let available_balance = 200_000_000;

        let tradable_amount = get_tradable_amount(
            collateral_token,
            available_balance,
            leverage,
            position_token,
            0,
            protocol_fee_rate,
            protocol_fee_rate_on_collateral,
            fusion_pool,
            true,
        )
        .unwrap();
        assert_eq!(tradable_amount, 945925390);

        let quote = get_increase_spot_position_quote(
            tradable_amount,
            collateral_token,
            position_token,
            leverage,
            Some(0),
            protocol_fee_rate,
            protocol_fee_rate_on_collateral,
            NATIVE_MINT,
            TUNA_MINT,
            fusion_pool,
            tick_arrays,
        )
        .await
        .unwrap();
        // TODO: fix precision error
        assert_eq!(quote.collateral, available_balance + 1);
        //assert_eq!(quote.estimated_amount, tradable_amount);
    }

    #[tokio::test]
    async fn tradable_amount_for_reducing_existing_long_position() {
        let sqrt_price = price_to_sqrt_price(200.0, 9, 6);
        let fusion_pool = test_fusion_pool(sqrt_price);
        let tick_arrays = Some(test_tick_arrays(fusion_pool));

        for i in 0..2 {
            let collateral_token = if i == 0 { TOKEN_A } else { TOKEN_B };
            let position_token = if i == 0 { TOKEN_A } else { TOKEN_B };
            let leverage = 5.0;
            let position_amount = 5_000_000_000;
            let position_debt = 800_000_000;
            let protocol_fee_rate = (HUNDRED_PERCENT / 100) as u16;
            let protocol_fee_rate_on_collateral = (HUNDRED_PERCENT / 200) as u16;
            let available_balance = 50_000_000_000;

            let tradable_amount = get_tradable_amount(
                collateral_token,
                available_balance,
                leverage,
                position_token,
                position_amount,
                protocol_fee_rate,
                protocol_fee_rate_on_collateral,
                fusion_pool,
                false,
            )
            .unwrap();
            assert_eq!(tradable_amount, 5_000_000_000);

            let quote = get_decrease_spot_position_quote(
                tradable_amount,
                collateral_token,
                5.0,
                Some(0),
                position_token,
                position_amount,
                position_debt,
                NATIVE_MINT,
                TUNA_MINT,
                fusion_pool,
                tick_arrays.clone(),
            )
            .await
            .unwrap();

            assert_eq!(quote.estimated_amount, 0);
        }
    }
}
