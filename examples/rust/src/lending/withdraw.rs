use std::error::Error;

use solana_client::rpc_client::RpcClient;
use solana_sdk::{instruction::Instruction, signer::Signer};
use spl_associated_token_account::{
  instruction::create_associated_token_account, ID as ASSOCIATED_TOKEN_PROGRAM_ID,
};
use spl_token::{instruction::close_account, ID as TOKEN_PROGRAM_ID};
use tuna_client::WithdrawBuilder;

use crate::utils::{
  common::{account_exists, is_wsol_mint},
  lending::{prepare_lending_accounts_and_parameters, LendingAccountsAndParameters},
  solana::create_and_send_transaction,
};

pub struct WithdrawLendingPositionInstructions {
  withdraw_lending_ix: Instruction,
  create_ata_ix: Option<Instruction>,
  close_wsol_ata_ix: Option<Instruction>,
}

pub fn withdraw(rpc: RpcClient, authority: Box<dyn Signer>) -> Result<(), Box<dyn Error>> {
  // Get common accounts and parameters necessary for both `createAndDepositLendingPosition()` and `withdrawLendingPosition()`
  let LendingAccountsAndParameters {
    token_mint_address,
    amount,
    tuna_config_pda,
    vault_pda,
    lending_position_pda,
    authority_ata,
    vault_ata,
  } = prepare_lending_accounts_and_parameters(&rpc, &authority)?;

  let mut withdraw_lending_builder = WithdrawBuilder::new();

  withdraw_lending_builder
    .authority(authority.pubkey())
    .authority_ata(authority_ata)
    .tuna_config(tuna_config_pda)
    .lending_position(lending_position_pda)
    .vault(vault_pda)
    .vault_ata(vault_ata)
    .mint(token_mint_address)
    .funds(amount)
    .shares(0)
    .token_program(TOKEN_PROGRAM_ID)
    .associated_token_program(ASSOCIATED_TOKEN_PROGRAM_ID);

  let mut instructions = WithdrawLendingPositionInstructions {
    withdraw_lending_ix: withdraw_lending_builder.instruction(),
    create_ata_ix: None,
    close_wsol_ata_ix: None,
  };

  if !account_exists(&rpc, &authority_ata)? {
    instructions.create_ata_ix = Some(create_associated_token_account(
      &authority.pubkey(),
      &authority.pubkey(),
      &token_mint_address,
      &TOKEN_PROGRAM_ID,
    ));
  }

  if is_wsol_mint(&token_mint_address)? {
    instructions.close_wsol_ata_ix = Some(close_account(
      &TOKEN_PROGRAM_ID,
      &authority_ata,
      &authority.pubkey(),
      &authority.pubkey(),
      &[&authority.pubkey()],
    )?);
  }

  let mut instructions_array: Vec<Instruction> = instructions
    .create_ata_ix
    .into_iter()
    .chain(std::iter::once(instructions.withdraw_lending_ix))
    .chain(instructions.close_wsol_ata_ix.into_iter())
    .collect();

  create_and_send_transaction(&rpc, &authority, &mut instructions_array, None, None, None)
}
