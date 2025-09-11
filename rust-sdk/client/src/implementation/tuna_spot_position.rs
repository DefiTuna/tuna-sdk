use crate::accounts::*;
use crate::consts::HUNDRED_PERCENT;
use crate::math::fixed::Rounding;
use crate::math::{sqrt_price_x64_to_price_x64, Fixed128};
use crate::types::*;
use crate::{impl_tuna_position, TunaError as ErrorCode, TunaLimitOrderType, TunaPosition, TunaPositionKind};
use fixed::types::U64F64;
use fusionamm_core::{sqrt_price_to_tick_index, MAX_SQRT_PRICE, MIN_SQRT_PRICE};
use solana_pubkey::Pubkey;
use std::fmt;

impl_tuna_position!(TunaSpotPosition);

impl TunaPosition for TunaSpotPosition {
    fn kind(&self) -> TunaPositionKind {
        TunaPositionKind::Spot
    }

    fn get_version(&self) -> u16 {
        self.version
    }

    fn get_position_mint(&self) -> Pubkey {
        self.position_mint
    }

    fn get_pool(&self) -> Pubkey {
        self.pool
    }

    fn get_authority(&self) -> Pubkey {
        self.authority
    }

    fn get_mint_a(&self) -> Pubkey {
        self.mint_a
    }

    fn get_mint_b(&self) -> Pubkey {
        self.mint_b
    }

    fn get_total_balance(&self, _sqrt_price: u128) -> Result<(u64, u64), ErrorCode> {
        match self.position_token {
            PoolToken::A => Ok((self.amount, 0)),
            PoolToken::B => Ok((0, self.amount)),
        }
    }

    fn get_leftovers(&self) -> (u64, u64) {
        (0, 0)
    }

    fn get_loan_shares(&self) -> (u64, u64) {
        match self.position_token {
            PoolToken::A => (0, self.loan_shares),
            PoolToken::B => (self.loan_shares, 0),
        }
    }

    fn compute_total_and_debt(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<(u64, u64), ErrorCode> {
        TunaSpotPosition::compute_total_and_debt(self, sqrt_price, vault_a, vault_b)
    }

    fn compute_leverage(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<Fixed128, ErrorCode> {
        TunaSpotPosition::compute_leverage(self, sqrt_price, vault_a, vault_b)
    }

    fn is_limit_order_reached(&self, sqrt_price: u128) -> Option<TunaLimitOrderType> {
        if sqrt_price <= self.lower_limit_order_sqrt_price {
            return Some(TunaLimitOrderType::StopLoss);
        }

        if sqrt_price >= self.upper_limit_order_sqrt_price {
            return Some(TunaLimitOrderType::TakeProfit);
        }

        None
    }

    fn is_liquidated_or_closed(&self) -> bool {
        TunaSpotPosition::is_liquidated_or_closed(self)
    }

    fn is_healthy(&self, sqrt_price: u128, market: &Market, vault_a: &Vault, vault_b: &Vault) -> Result<(bool, u32), ErrorCode> {
        TunaSpotPosition::is_healthy(self, sqrt_price, market, vault_a, vault_b)
    }
}

impl fmt::Display for TunaSpotPosition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "total={} {:?}; loan_shares={}; sl/tp=~[{}; {}]; pool={}",
            self.amount,
            self.position_token,
            self.loan_shares,
            if self.lower_limit_order_sqrt_price == MIN_SQRT_PRICE {
                "--".to_string()
            } else {
                sqrt_price_to_tick_index(self.lower_limit_order_sqrt_price).to_string()
            },
            if self.upper_limit_order_sqrt_price == MAX_SQRT_PRICE {
                "--".to_string()
            } else {
                sqrt_price_to_tick_index(self.upper_limit_order_sqrt_price).to_string()
            },
            self.pool.to_string()
        )
    }
}
