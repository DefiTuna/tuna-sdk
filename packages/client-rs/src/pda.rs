use solana_program::pubkey::Pubkey;
use crate::TUNA_ID;

pub fn get_tuna_position_address(position_mint: &Pubkey) -> (Pubkey, u8) {
    let seeds = &[b"tuna_position", position_mint.as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}

pub fn get_market_address(whirlpool: &Pubkey) -> (Pubkey, u8) {
    let seeds = &[b"market", whirlpool.as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}

pub fn get_tuna_config_address() -> (Pubkey, u8) {
    let seeds = &[b"tuna_config".as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}

pub fn get_vault_address(token_mint: &Pubkey) -> (Pubkey, u8) {
    let seeds = &[b"vault", token_mint.as_ref()];
    Pubkey::find_program_address(seeds, &TUNA_ID)
}