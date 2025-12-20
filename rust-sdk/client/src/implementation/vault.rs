use crate::accounts::Vault;
use crate::TunaError as ErrorCode;
use defituna_core::borrow_curve::sample;
use defituna_core::fixed::{mul_div_64, Rounding};
use defituna_core::Fixed128;
use std::fmt;

pub const INTEREST_ACCRUE_MIN_INTERVAL: u64 = 60;

impl Vault {
    pub fn get_utilization(&self) -> f64 {
        if self.deposited_funds > 0 {
            self.borrowed_funds as f64 / self.deposited_funds as f64
        } else {
            1.0
        }
    }

    /// Returns the sum of the first three terms of a Taylor expansion of e^r - 1, to approximate a
    /// continuous compound interest rate.
    pub fn compounded_interest_rate(r: f64) -> f64 {
        let t1 = r;
        let t2 = r * r / 2.0;
        let t3 = t2 * r / 3.0;
        t1 + t2 + t3
    }

    pub fn accrue_interest(&mut self, timestamp: u64) -> Result<(), ErrorCode> {
        let elapsed_time_seconds = timestamp.checked_sub(self.last_update_timestamp).ok_or(ErrorCode::MathUnderflow)?;

        // Nothing to accrue.
        if self.borrowed_funds == 0 {
            self.last_update_timestamp = timestamp;
            return Ok(());
        }

        // Don't accrue interest too often to avoid losing precision.
        if elapsed_time_seconds < INTEREST_ACCRUE_MIN_INTERVAL {
            return Ok(());
        }
        // Compute interest based on utilization.
        let utilization = self.get_utilization();
        let interest_rate_multiplier = sample(utilization);
        let interest_rate = Fixed128::from_bits(self.interest_rate as u128).to_num::<f64>() * interest_rate_multiplier;

        let interest = Self::compounded_interest_rate(interest_rate * elapsed_time_seconds as f64);
        let interest_amount = (interest * self.borrowed_funds as f64) as u64;

        self.borrowed_funds = self.borrowed_funds.checked_add(interest_amount).ok_or(ErrorCode::MathOverflow)?;
        self.deposited_funds = self.deposited_funds.checked_add(interest_amount).ok_or(ErrorCode::MathOverflow)?;

        self.last_update_timestamp = timestamp;

        Ok(())
    }

    pub fn funds_to_shares(funds: u64, total_funds: u64, total_shares: u64, rounding: Rounding) -> Result<u64, ErrorCode> {
        if total_funds > 0 {
            Ok(mul_div_64(funds, total_shares, total_funds, rounding).map_err(|_| ErrorCode::MathOverflow)?)
        } else {
            Ok(funds)
        }
    }

    pub fn shares_to_funds(shares: u64, total_funds: u64, total_shares: u64, rounding: Rounding) -> Result<u64, ErrorCode> {
        if total_shares > 0 {
            Ok(mul_div_64(shares, total_funds, total_shares, rounding).map_err(|_| ErrorCode::MathOverflow)?)
        } else {
            Ok(shares)
        }
    }

    pub fn calculate_deposited_shares(&self, funds: u64, rounding: Rounding) -> Result<u64, ErrorCode> {
        Self::funds_to_shares(funds, self.deposited_funds, self.deposited_shares, rounding)
    }

    pub fn calculate_deposited_funds(&self, shares: u64, rounding: Rounding) -> Result<u64, ErrorCode> {
        Self::shares_to_funds(shares, self.deposited_funds, self.deposited_shares, rounding)
    }

    pub fn calculate_borrowed_shares(&self, funds: u64, rounding: Rounding) -> Result<u64, ErrorCode> {
        Self::funds_to_shares(funds, self.borrowed_funds, self.borrowed_shares, rounding)
    }

    pub fn calculate_borrowed_funds(&self, shares: u64, rounding: Rounding) -> Result<u64, ErrorCode> {
        Self::shares_to_funds(shares, self.borrowed_funds, self.borrowed_shares, rounding)
    }
}

impl fmt::Display for Vault {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "mint={}; borrowed/deposited funds = {} / {}; bad_debt = {}",
            self.mint.to_string(),
            self.borrowed_funds,
            self.deposited_funds,
            self.unpaid_debt_shares
        )
    }
}
