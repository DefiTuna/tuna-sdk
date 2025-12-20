use crate::accounts::*;
use crate::consts::HUNDRED_PERCENT;
use crate::types::*;
use crate::{impl_tuna_position, TunaError as ErrorCode, TunaLimitOrderType, TunaPosition, TunaPositionKind};
use defituna_core::fixed::Rounding;
use defituna_core::price::sqrt_price_x64_to_price_x64;
use fixed::types::U64F64;
use fusionamm_core::{
    get_amounts_from_liquidity, sqrt_price_to_tick_index, tick_index_to_sqrt_price, MAX_SQRT_PRICE, MAX_TICK_INDEX, MIN_SQRT_PRICE, MIN_TICK_INDEX,
};
use solana_pubkey::Pubkey;
use std::fmt;

impl_tuna_position!(TunaLpPosition);

impl TunaPosition for TunaLpPosition {
    fn kind(&self) -> TunaPositionKind {
        TunaPositionKind::Liquidity
    }

    fn get_version(&self) -> u16 {
        self.version
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

    fn get_total_balance(&self, sqrt_price: u128) -> Result<(u64, u64), ErrorCode> {
        if self.liquidity == 0 {
            return Ok((0, 0));
        }

        let lower_sqrt_price = tick_index_to_sqrt_price(self.tick_lower_index);
        let upper_sqrt_price = tick_index_to_sqrt_price(self.tick_upper_index);

        get_amounts_from_liquidity(self.liquidity, sqrt_price, lower_sqrt_price, upper_sqrt_price, false)
            .map_err(|_| ErrorCode::MathOverflow)
            .map(|amounts| (amounts.a, amounts.b))
    }

    fn get_leftovers(&self) -> (u64, u64) {
        (self.leftovers_a, self.leftovers_b)
    }

    fn get_loan_shares(&self) -> (u64, u64) {
        (self.loan_shares_a, self.loan_shares_b)
    }

    fn compute_total_and_debt(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<(u64, u64), ErrorCode> {
        TunaLpPosition::compute_total_and_debt(self, sqrt_price, vault_a, vault_b)
    }

    fn compute_leverage(&self, sqrt_price: u128, vault_a: &Vault, vault_b: &Vault) -> Result<f64, ErrorCode> {
        TunaLpPosition::compute_leverage(self, sqrt_price, vault_a, vault_b)
    }

    fn is_limit_order_reached(&self, sqrt_price: u128) -> Option<TunaLimitOrderType> {
        // Old positions don't have limit orders.
        if self.version >= 7 {
            if sqrt_price <= self.lower_limit_order_sqrt_price {
                return Some(TunaLimitOrderType::StopLoss);
            }

            if sqrt_price >= self.upper_limit_order_sqrt_price {
                return Some(TunaLimitOrderType::TakeProfit);
            }
        } else if self.version >= 4 {
            if self.tick_stop_loss_index >= MIN_TICK_INDEX {
                let lower_limit_order_sqrt_price = tick_index_to_sqrt_price(self.tick_stop_loss_index);
                if sqrt_price <= lower_limit_order_sqrt_price {
                    return Some(TunaLimitOrderType::StopLoss);
                }
            }

            if self.tick_take_profit_index <= MAX_TICK_INDEX {
                let upper_limit_order_sqrt_price = tick_index_to_sqrt_price(self.tick_take_profit_index);
                if sqrt_price >= upper_limit_order_sqrt_price {
                    return Some(TunaLimitOrderType::TakeProfit);
                }
            }
        } else {
            return None;
        }

        None
    }

    fn is_liquidated_or_closed(&self) -> bool {
        self.state != TunaPositionState::Normal
    }

    fn is_healthy(&self, sqrt_price: u128, market: &Market, vault_a: &Vault, vault_b: &Vault) -> Result<(bool, u32), ErrorCode> {
        TunaLpPosition::is_healthy(self, sqrt_price, market, vault_a, vault_b)
    }
}

impl fmt::Display for TunaLpPosition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.version >= 7 {
            write!(
                f,
                "L={}; shares=[{}; {}]; rng=[{}; {}]; sl/tp=~[{}; {}]; pool={}",
                self.liquidity,
                self.loan_shares_a,
                self.loan_shares_b,
                self.tick_lower_index,
                self.tick_upper_index,
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
        } else {
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
}
