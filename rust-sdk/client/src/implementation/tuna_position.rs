use crate::accounts::{Market, Vault};
use crate::TunaError as ErrorCode;
use solana_pubkey::Pubkey;
use std::any::Any;
use uint::construct_uint;

construct_uint! {
    struct U256(4);
}

fn exact_value_numerator(amount_a: u64, amount_b: u64, sqrt_price_squared: U256) -> Option<U256> {
    let value_a = U256::from(amount_a).checked_mul(sqrt_price_squared)?;
    let value_b = U256::from(amount_b).checked_mul(U256::from(1u8) << 128)?;
    value_a.checked_add(value_b)
}

/// Compares debt and total values without truncating the Q128.128 price square.
fn exact_debt_exceeds_total(total_a: u64, total_b: u64, debt_a: u64, debt_b: u64, sqrt_price: u128) -> Option<bool> {
    let sqrt_price_squared = U256::from(sqrt_price).checked_mul(U256::from(sqrt_price))?;
    let exact_total = exact_value_numerator(total_a, total_b, sqrt_price_squared)?;
    let exact_debt = exact_value_numerator(debt_a, debt_b, sqrt_price_squared)?;
    Some(exact_debt > exact_total)
}

pub(crate) fn classify_zero_total_with_debt(
    total_a: u64,
    total_b: u64,
    debt_a: u64,
    debt_b: u64,
    sqrt_price: u128,
) -> Result<(bool, u32), ErrorCode> {
    match exact_debt_exceeds_total(total_a, total_b, debt_a, debt_b, sqrt_price) {
        Some(true) => Ok((false, u32::MAX)),
        Some(false) | None => Err(ErrorCode::PositionValuationDegenerate),
    }
}

#[derive(PartialEq, Eq)]
pub enum TunaPositionKind {
    Liquidity,
    Spot,
}

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TunaLimitOrderType {
    StopLoss = 0,
    TakeProfit = 1,
}

pub trait TunaPosition: Any {
    fn kind(&self) -> TunaPositionKind;
    fn get_version(&self) -> u16;
    fn get_pool(&self) -> Pubkey;
    fn get_authority(&self) -> Pubkey;
    fn get_mint_a(&self) -> Pubkey;
    fn get_mint_b(&self) -> Pubkey;
    fn get_total_balance(&self, sqrt_price: u128) -> Result<(u64, u64), ErrorCode>;
    fn get_leftovers(&self) -> (u64, u64);
    fn get_loan_shares(&self) -> (u64, u64);
    fn compute_total_and_debt(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<(u64, u64), ErrorCode>;
    fn compute_leverage(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<f64, ErrorCode>;
    fn is_limit_order_reached(&self, sqrt_price: u128) -> Option<TunaLimitOrderType>;
    fn is_liquidated_or_closed(&self) -> bool;
    fn is_healthy(&self, sqrt_price: u128, market: &Market, vault_a: &Vault, vault_b: &Vault) -> Result<(bool, u32), ErrorCode>;
}

#[macro_export]
macro_rules! impl_tuna_position {
    ($t:ty) => {
        impl $t {
            fn compute_total_debt_and_amounts(
                &self,
                sqrt_price: u128,
                vault_a: &Vault,
                vault_b: &Vault,
            ) -> Result<((u64, u64), (u64, u64, u64, u64)), ErrorCode> {
                let (mut total_a, mut total_b) = self.get_total_balance(sqrt_price)?;
                let (leftovers_a, leftovers_b) = self.get_leftovers();

                // Add leftovers before both the rounded and exact valuations.
                total_a = total_a.checked_add(leftovers_a).ok_or(ErrorCode::MathOverflow)?;
                total_b = total_b.checked_add(leftovers_b).ok_or(ErrorCode::MathOverflow)?;

                let price = sqrt_price_x64_to_price_x64(sqrt_price).map_err(|_| ErrorCode::MathOverflow)?;

                let total = U64F64::from(total_a)
                    .checked_mul(price)
                    .ok_or(ErrorCode::MathOverflow)?
                    .to_num::<u64>()
                    .checked_add(total_b)
                    .ok_or(ErrorCode::MathOverflow)?;

                let (loan_shares_a, loan_shares_b) = self.get_loan_shares();
                let debt_a = vault_a.calculate_borrowed_funds(loan_shares_a, Rounding::Up)?;
                let debt_b = vault_b.calculate_borrowed_funds(loan_shares_b, Rounding::Up)?;

                let debt = U64F64::from(debt_a)
                    .checked_mul(price)
                    .ok_or(ErrorCode::MathOverflow)?
                    .to_num::<u64>()
                    .checked_add(debt_b)
                    .ok_or(ErrorCode::MathOverflow)?;

                Ok(((total, debt), (total_a, total_b, debt_a, debt_b)))
            }

            /// Returns the current position total and debt size.
            pub fn compute_total_and_debt(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<(u64, u64), ErrorCode> {
                self.compute_total_debt_and_amounts(sqrt_price, vault_a, vault_b)
                    .map(|(valuation, _)| valuation)
            }

            /// Returns the current leverage of a position. Vaults must be passed with accrued interest.
            pub fn compute_leverage(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<f64, ErrorCode> {
                let (total, debt) = self.compute_total_and_debt(sqrt_price, vault_a, vault_b)?;

                // A genuinely empty position has 1.0x leverage. Rounded-away debt must
                // not make an indebted position look fresh.
                if total == 0 && debt == 0 {
                    let (loan_shares_a, loan_shares_b) = self.get_loan_shares();
                    if loan_shares_a != 0 || loan_shares_b != 0 {
                        return Err(ErrorCode::LeverageIsOutOfRange);
                    }
                    return Ok(1.0);
                }

                if debt >= total {
                    return Err(ErrorCode::LeverageIsOutOfRange.into());
                }

                let leverage = total as f64 / (total - debt) as f64;
                Ok(leverage)
            }

            /// Returns if the position is healthy or not. Vaults must be passed with accrued interest.
            pub fn is_healthy(&self, sqrt_price: u128, market: &Market, vault_a: &Vault, vault_b: &Vault) -> Result<(bool, u32), ErrorCode> {
                let (loan_shares_a, loan_shares_b) = self.get_loan_shares();

                if loan_shares_a == 0 && loan_shares_b == 0 {
                    return Ok((true, 0));
                }

                if vault_a.mint != self.mint_a || vault_b.mint != self.mint_b {
                    return Err(ErrorCode::InvalidInstructionArguments.into());
                }

                let ((total, debt), (total_a, total_b, debt_a, debt_b)) = self.compute_total_debt_and_amounts(sqrt_price, vault_a, vault_b)?;

                if total == 0 {
                    if debt == 0 {
                        // Both rounded values are ambiguous even if the exact values
                        // could be compared, so preserve the fail-closed behavior.
                        return Err(ErrorCode::PositionValuationDegenerate);
                    }

                    // The Q64.64 price used above already discarded low square bits.
                    // Admit liquidation only after the original sqrt price proves
                    // exact debt is strictly greater than exact total.
                    return $crate::implementation::tuna_position::classify_zero_total_with_debt(total_a, total_b, debt_a, debt_b, sqrt_price);
                }

                // Can't overflow because liquidation_threshold <= 1e6 and total is a little bigger than u64::MAX.
                let healthy = debt <= (total as u128 * market.liquidation_threshold as u128 / HUNDRED_PERCENT as u128) as u64;
                let ratio = (debt as u128 * HUNDRED_PERCENT as u128 / total as u128).min(u32::MAX as u128) as u32;

                Ok((healthy, ratio))
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    const SQRT_PRICE: u128 = 6_073_866_628;

    #[test]
    fn exact_counterexample_fails_closed() {
        assert_eq!(
            classify_zero_total_with_debt(10_100_000_000_000_000_000, 0, 0, 1, SQRT_PRICE),
            Err(ErrorCode::PositionValuationDegenerate)
        );
    }

    #[test]
    fn exact_insolvent_neighbor_is_unhealthy() {
        assert_eq!(classify_zero_total_with_debt(1, 0, 0, 1, SQRT_PRICE), Ok((false, u32::MAX)));
    }

    #[test]
    fn exact_comparison_overflow_fails_closed() {
        assert_eq!(classify_zero_total_with_debt(u64::MAX, 0, 0, 1, u128::MAX), Err(ErrorCode::PositionValuationDegenerate));
    }
}
