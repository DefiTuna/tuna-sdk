use crate::accounts::*;
use crate::consts::HUNDRED_PERCENT;
use crate::math::fixed::Rounding;
use crate::math::orca::liquidity::get_amounts_for_liquidity;
use crate::math::orca::tick_math::{sqrt_price_from_tick_index, MAX_TICK_INDEX, MIN_TICK_INDEX};
use crate::math::{sqrt_price_x64_to_price_x64, Fixed128};
use crate::types::*;
use crate::TunaError as ErrorCode;
use fixed::types::U64F64;
use std::fmt;

impl TunaPosition {
    /// Returns the total position balance.
    pub fn get_total_balance(&self, sqrt_price: u128) -> Result<(u64, u64), ErrorCode> {
        let lower_sqrt_price_x64 = sqrt_price_from_tick_index(self.tick_lower_index);
        let upper_sqrt_price_x64 = sqrt_price_from_tick_index(self.tick_upper_index);
        get_amounts_for_liquidity(sqrt_price, lower_sqrt_price_x64, upper_sqrt_price_x64, self.liquidity)
    }

    /// Returns the current position total and debt size.
    pub fn compute_total_and_debt(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<(u64, u64), ErrorCode> {
        let (mut total_a, mut total_b) = self.get_total_balance(sqrt_price)?;

        // Add leftovers to the total position amount.
        total_a = total_a.checked_add(self.leftovers_a).ok_or(ErrorCode::MathOverflow)?;
        total_b = total_b.checked_add(self.leftovers_b).ok_or(ErrorCode::MathOverflow)?;

        let price = sqrt_price_x64_to_price_x64(sqrt_price)?;

        let total = U64F64::from(total_a)
            .checked_mul(price)
            .ok_or(ErrorCode::MathOverflow)?
            .to_num::<u64>()
            .checked_add(total_b)
            .ok_or(ErrorCode::MathOverflow)?;

        let debt_a = vault_a.calculate_borrowed_funds(self.loan_shares_a, Rounding::Up)?;
        let debt_b = vault_b.calculate_borrowed_funds(self.loan_shares_b, Rounding::Up)?;

        let debt = U64F64::from(debt_a)
            .checked_mul(price)
            .ok_or(ErrorCode::MathOverflow)?
            .to_num::<u64>()
            .checked_add(debt_b)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok((total, debt))
    }

    /// Returns if the position is healthy or not. Vaults must be passed with accrued interest.
    pub fn is_healthy(&self, sqrt_price: u128, market: &Market, vault_a: &Vault, vault_b: &Vault) -> Result<(bool, u32), ErrorCode> {
        if (self.loan_shares_a == 0 && self.loan_shares_b == 0) || self.liquidity == 0 {
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

    pub fn is_liquidated(&self) -> bool {
        self.state != TunaPositionState::Normal
    }

    pub fn is_limit_order_reached(&self, sqrt_price: u128) -> bool {
        // Old positions don't have limit orders.
        if self.version < 4 {
            return false;
        }

        if self.tick_stop_loss_index >= MIN_TICK_INDEX {
            let stop_loss_sqrt_price = sqrt_price_from_tick_index(self.tick_stop_loss_index);
            if sqrt_price <= stop_loss_sqrt_price {
                return true;
            }
        }

        if self.tick_take_profit_index <= MAX_TICK_INDEX {
            let take_profit_sqrt_price = sqrt_price_from_tick_index(self.tick_take_profit_index);
            if sqrt_price >= take_profit_sqrt_price {
                return true;
            }
        }

        false
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

    pub fn get_pool_key(&self) -> String {
        self.pool.to_string()
    }
}

impl fmt::Display for TunaPosition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "L={}; shares=[{}; {}]; rng=[{}; {}]; sl/tp=[{}; {}]; pool={}",
            self.liquidity,
            self.loan_shares_a,
            self.loan_shares_b,
            self.tick_lower_index,
            self.tick_upper_index,
            if self.tick_stop_loss_index == i32::MIN {
                "--".to_string()
            } else {
                self.tick_stop_loss_index.to_string()
            },
            if self.tick_take_profit_index == i32::MAX {
                "--".to_string()
            } else {
                self.tick_take_profit_index.to_string()
            },
            self.pool.to_string()
        )
    }
}
