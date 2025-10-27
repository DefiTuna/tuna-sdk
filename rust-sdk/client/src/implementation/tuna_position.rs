use crate::accounts::{Market, Vault};
use crate::Fixed128;
use crate::TunaError as ErrorCode;
use solana_pubkey::Pubkey;
use std::any::Any;

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
    fn compute_leverage(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<Fixed128, ErrorCode>;
    fn is_limit_order_reached(&self, sqrt_price: u128) -> Option<TunaLimitOrderType>;
    fn is_liquidated_or_closed(&self) -> bool;
    fn is_healthy(&self, sqrt_price: u128, market: &Market, vault_a: &Vault, vault_b: &Vault) -> Result<(bool, u32), ErrorCode>;
}

#[macro_export]
macro_rules! impl_tuna_position {
    ($t:ty) => {
        impl $t {
            /// Returns the current position total and debt size.
            pub fn compute_total_and_debt(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<(u64, u64), ErrorCode> {
                let (mut total_a, mut total_b) = self.get_total_balance(sqrt_price)?;

                // Add leftovers to the total position amount.
                total_a += self.get_leftovers().0;
                total_b += self.get_leftovers().1;

                let price = sqrt_price_x64_to_price_x64(sqrt_price)?;

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

                Ok((total, debt))
            }

            /// Returns the current leverage of a position. Vaults must be passed with accrued interest.
            pub fn compute_leverage(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<Fixed128, ErrorCode> {
                let (total, debt) = self.compute_total_and_debt(sqrt_price, vault_a, vault_b)?;

                // We assume that the leverage of an empty position is always 1.0x.
                if total == 0 {
                    return Ok(Fixed128::ONE);
                }

                if debt >= total {
                    return Err(ErrorCode::LeverageIsOutOfRange.into());
                }

                let leverage = Fixed128::from_num(total) / Fixed128::from_num(total - debt);
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

                let (total, debt) = self.compute_total_and_debt(sqrt_price, vault_a, vault_b)?;

                // Compute if the position is healthy. Can't overflow because liquidation_threshold <= 1e6 and total is a little bigger than u64::MAX.
                let healthy = total == 0 || debt <= (total as u128 * market.liquidation_threshold as u128 / HUNDRED_PERCENT as u128) as u64;
                let ratio = if total == 0 {
                    0
                } else {
                    (debt as u128 * HUNDRED_PERCENT as u128 / total as u128) as u32
                };

                Ok((healthy, ratio))
            }
        }
    };
}
