use crate::instructions::{CreateVaultPermissionless, CreateVaultPermissionlessInstructionArgs};
use crate::utils::get_create_ata_instructions;
use crate::{get_tuna_config_address, get_vault_address};
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub fn create_vault_permissionless_instructions(
    authority: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    market: &Pubkey,
    args: CreateVaultPermissionlessInstructionArgs,
) -> Vec<Instruction> {
    let vault_address = get_vault_address(mint, Some(market)).0;
    let mut instructions = get_create_ata_instructions(&mint, &vault_address, authority, &token_program, 0).create;
    instructions.push(create_vault_permissionless_instruction(authority, mint, token_program, market, args));
    instructions
}

pub fn create_vault_permissionless_instruction(
    authority: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    market: &Pubkey,
    args: CreateVaultPermissionlessInstructionArgs,
) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let vault_address = get_vault_address(mint, Some(market)).0;
    let vault_ata = get_associated_token_address_with_program_id(&vault_address, &mint, &token_program);

    let ix_builder = CreateVaultPermissionless {
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
