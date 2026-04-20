use crate::instructions::OpenLendingPositionV2;
use crate::get_lending_position_address;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;

pub fn open_lending_position_v2_instruction(authority: &Pubkey, mint: &Pubkey, vault: &Pubkey) -> Instruction {
    let lending_position_address = get_lending_position_address(&authority, &vault).0;

    let ix_builder = OpenLendingPositionV2 {
        authority: *authority,
        mint: *mint,
        vault: *vault,
        lending_position: lending_position_address,
        system_program: system_program::ID,
    };

    ix_builder.instruction()
}
