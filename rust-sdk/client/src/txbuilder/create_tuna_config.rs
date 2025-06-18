use crate::get_tuna_config_address;
use crate::instructions::{CreateTunaConfig, CreateTunaConfigInstructionArgs};
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use solana_program::system_program;

pub fn create_tuna_config_instruction(
    authority: &Pubkey,
    owner_authority: &Pubkey,
    admin_authority: &Pubkey,
    liquidator_authority: &Pubkey,
    fee_recipient: &Pubkey,
) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;

    let ix_builder = CreateTunaConfig {
        authority: *authority,
        tuna_config: tuna_config_address,
        system_program: system_program::ID,
        rent: solana_program::sysvar::rent::ID,
    };

    ix_builder.instruction(CreateTunaConfigInstructionArgs {
        owner_authority: *owner_authority,
        admin_authority: *admin_authority,
        liquidator_authority: *liquidator_authority,
        fee_recipient: *fee_recipient,
    })
}
