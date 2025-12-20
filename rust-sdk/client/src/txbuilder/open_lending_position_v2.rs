use crate::instructions::OpenLendingPositionV2;
use crate::{get_lending_position_address, get_vault_address};
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;

pub fn open_lending_position_instruction(authority: &Pubkey, mint: &Pubkey) -> Instruction {
    let vault_address = get_vault_address(&mint).0;
    let lending_position_address = get_lending_position_address(&authority, &mint).0;

    let ix_builder = OpenLendingPositionV2 {
        authority: *authority,
        mint: *mint,
        vault: vault_address,
        lending_position: lending_position_address,
        system_program: system_program::ID,
    };

    ix_builder.instruction()
}
