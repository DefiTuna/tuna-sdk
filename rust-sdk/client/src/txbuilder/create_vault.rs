use crate::instructions::{CreateVault, CreateVaultInstructionArgs};
use crate::utils::get_create_ata_instructions;
use crate::{get_tuna_config_address, get_vault_address};
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use solana_program::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub fn create_vault_instructions(authority: &Pubkey, mint: &Pubkey, token_program: &Pubkey, args: CreateVaultInstructionArgs) -> Vec<Instruction> {
    let vault_address = get_vault_address(mint).0;
    let mut instructions = get_create_ata_instructions(&mint, &vault_address, authority, &token_program, 0).create;
    instructions.push(create_vault_instruction(authority, mint, token_program, args));
    instructions
}

pub fn create_vault_instruction(authority: &Pubkey, mint: &Pubkey, token_program: &Pubkey, args: CreateVaultInstructionArgs) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let vault_address = get_vault_address(mint).0;
    let vault_ata = get_associated_token_address_with_program_id(&vault_address, &mint, &token_program);

    let ix_builder = CreateVault {
        authority: *authority,
        mint: *mint,
        tuna_config: tuna_config_address,
        vault: vault_address,
        vault_ata,
        token_program: *token_program,
        system_program: system_program::ID,
    };

    ix_builder.instruction(args)
}
