use crate::instructions::{Withdraw, WithdrawInstructionArgs};
use crate::utils::get_create_ata_instructions;
use crate::{get_lending_position_address, get_tuna_config_address, get_vault_address};
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address;

pub fn withdraw_instructions(authority: &Pubkey, mint: &Pubkey, funds: u64, shares: u64) -> Vec<Instruction> {
    let authority_ata_instructions = get_create_ata_instructions(&mint, authority, authority, &spl_token::ID, 0);

    let mut instructions = vec![];
    instructions.extend(authority_ata_instructions.create);
    instructions.push(withdraw_instruction(authority, mint, funds, shares));
    instructions.extend(authority_ata_instructions.cleanup);

    instructions
}

pub fn withdraw_instruction(authority: &Pubkey, mint: &Pubkey, funds: u64, shares: u64) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let vault_address = get_vault_address(&mint).0;
    let lending_position_address = get_lending_position_address(&authority, &mint).0;

    let authority_ata = get_associated_token_address(&authority, &mint);
    let vault_ata = get_associated_token_address(&vault_address, &mint);

    let ix_builder = Withdraw {
        authority: *authority,
        authority_ata,
        mint: *mint,
        tuna_config: tuna_config_address,
        vault: vault_address,
        vault_ata,
        lending_position: lending_position_address,
        token_program: spl_token::ID,
        associated_token_program: spl_associated_token_account::ID,
    };

    ix_builder.instruction(WithdrawInstructionArgs { funds, shares })
}
