use crate::instructions::{Deposit, DepositInstructionArgs};
use crate::utils::get_create_ata_instructions;
use crate::{get_lending_position_address, get_tuna_config_address, get_vault_address};
use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub fn deposit_instructions(rpc: &RpcClient, authority: &Pubkey, mint: &Pubkey, amount: u64) -> Result<Vec<Instruction>> {
    let mint_account = rpc.get_account(mint.into())?;

    let authority_ata_instructions = get_create_ata_instructions(&mint, authority, authority, &mint_account.owner, amount);

    let mut instructions = vec![];
    instructions.extend(authority_ata_instructions.create);
    instructions.push(deposit_instruction(authority, mint, &mint_account.owner, amount));
    instructions.extend(authority_ata_instructions.cleanup);

    Ok(instructions)
}

pub fn deposit_instruction(authority: &Pubkey, mint: &Pubkey, token_program: &Pubkey, amount: u64) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let vault_address = get_vault_address(&mint).0;
    let lending_position_address = get_lending_position_address(&authority, &mint).0;

    let authority_ata = get_associated_token_address_with_program_id(&authority, &mint, token_program);
    let vault_ata = get_associated_token_address_with_program_id(&vault_address, &mint, token_program);

    let ix_builder = Deposit {
        authority: *authority,
        authority_ata,
        mint: *mint,
        tuna_config: tuna_config_address,
        vault: vault_address,
        vault_ata,
        lending_position: lending_position_address,
        token_program: *token_program,
        memo_program: spl_memo::ID,
    };

    ix_builder.instruction(DepositInstructionArgs { amount })
}
