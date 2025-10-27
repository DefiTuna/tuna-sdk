use crate::{DEFAULT_PUSH_ORACLE_PROGRAM_ID, TUNA_ID};
use solana_pubkey::Pubkey;

pub fn get_tuna_config_address() -> (Pubkey, u8) {
    let seeds = &[b"tuna_config".as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}

pub fn get_market_address(pool: &Pubkey) -> (Pubkey, u8) {
    let seeds = &[b"market", pool.as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}

pub fn get_vault_address(token_mint: &Pubkey) -> (Pubkey, u8) {
    let seeds = &[b"vault", token_mint.as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}

pub fn get_lending_position_address(authority: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
    let seeds = &[b"lending_position", authority.as_ref(), mint.as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}

pub fn get_tuna_liquidity_position_address(position_mint: &Pubkey) -> (Pubkey, u8) {
    let seeds = &[b"tuna_position", position_mint.as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}

pub fn get_tuna_spot_position_address(authority: &Pubkey, pool: &Pubkey) -> (Pubkey, u8) {
    let seeds = &[b"tuna_spot_position", authority.as_ref(), pool.as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}

pub fn get_pyth_price_update_account_address(shard_id: u16, feed_id: [u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[&shard_id.to_le_bytes(), feed_id.as_ref()], &DEFAULT_PUSH_ORACLE_PROGRAM_ID)
}
