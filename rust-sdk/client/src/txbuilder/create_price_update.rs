use crate::instructions::CreatePriceUpdate;
use crate::{get_tuna_config_address, get_tuna_price_update_address};
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;

pub fn create_price_update_instruction(authority: &Pubkey, mint: &Pubkey) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let price_update_address = get_tuna_price_update_address(mint).0;

    let ix_builder = CreatePriceUpdate {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint: *mint,
        price_update: price_update_address,
        system_program: system_program::ID,
    };

    ix_builder.instruction()
}
