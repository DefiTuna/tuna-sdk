use crate::instructions::OpenLendingPosition;
use crate::{get_lending_position_address, get_tuna_config_address, get_vault_address};
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;

pub fn open_lending_position_instruction(authority: &Pubkey, mint: &Pubkey) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let vault_address = get_vault_address(&mint).0;
    let lending_position_address = get_lending_position_address(&authority, &mint).0;

    let ix_builder = OpenLendingPosition {
        authority: *authority,
        tuna_config: tuna_config_address,
        vault: vault_address,
        lending_position: lending_position_address,
        mint: *mint,
        system_program: system_program::ID,
    };

    ix_builder.instruction()
}
