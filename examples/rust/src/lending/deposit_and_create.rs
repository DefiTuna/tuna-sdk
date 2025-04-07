use std::error::Error;

use solana_client::rpc_client::RpcClient;
use solana_sdk::{
  feature_set::rent_for_sysvars::ID as RENT_SYSVAR_ID, instruction::Instruction, signer::Signer,
  system_instruction::transfer, system_program::ID as SYSTEM_PROGRAM_ID,
};
use spl_associated_token_account::{
  instruction::create_associated_token_account, ID as ASSOCIATED_TOKEN_PROGRAM_ID,
};
use spl_token::{
  instruction::{close_account, sync_native},
  ID as TOKEN_PROGRAM_ID,
};
use tuna_client::{CreateLendingPositionBuilder, DepositBuilder};

use crate::utils::{
  common::{account_exists, is_wsol_mint},
  lending::*,
  solana::create_and_send_transaction,
};

struct CreateAndDepositLendingPositionInstructions {
  deposit_lending_ix: Instruction,
  create_lending_position_ix: Option<Instruction>,
  create_ata_ix: Option<Instruction>,
  wsol_ata_ixs: Vec<Instruction>,
  close_wsol_ata_ix: Option<Instruction>,
}

pub fn deposit_and_create(
  rpc: RpcClient,
  authority: Box<dyn Signer>,
) -> Result<(), Box<dyn Error>> {
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

  let mut deposit_lending_builder = DepositBuilder::new();

  deposit_lending_builder
    .amount(amount)
    .authority(authority.pubkey())
    .authority_ata(authority_ata)
    .tuna_config(tuna_config_pda)
    .lending_position(lending_position_pda)
    .vault(vault_pda)
    .vault_ata(vault_ata)
    .mint(token_mint_address)
    .token_program(TOKEN_PROGRAM_ID)
    .associated_token_program(ASSOCIATED_TOKEN_PROGRAM_ID);

  let mut instructions = CreateAndDepositLendingPositionInstructions {
    deposit_lending_ix: deposit_lending_builder.instruction(),
    create_lending_position_ix: None,
    create_ata_ix: None,
    wsol_ata_ixs: vec![],
    close_wsol_ata_ix: None,
  };

  if !account_exists(&rpc, &lending_position_pda)? {
    let mut create_lending_position_builder = CreateLendingPositionBuilder::new();

    create_lending_position_builder
      .authority(authority.pubkey())
      .tuna_config(tuna_config_pda)
      .vault(vault_pda)
      .lending_position(lending_position_pda)
      .pool_mint(token_mint_address)
      .token_program(TOKEN_PROGRAM_ID)
      .system_program(SYSTEM_PROGRAM_ID)
      .rent(RENT_SYSVAR_ID)
      .associated_token_program(ASSOCIATED_TOKEN_PROGRAM_ID);

    instructions.create_lending_position_ix = Some(create_lending_position_builder.instruction());
  }

  if !account_exists(&rpc, &authority_ata)? {
    instructions.create_ata_ix = Some(create_associated_token_account(
      &authority.pubkey(),
      &authority.pubkey(),
      &token_mint_address,
      &TOKEN_PROGRAM_ID,
    ));
  }

  if is_wsol_mint(&token_mint_address)? {
    instructions
      .wsol_ata_ixs
      .push(transfer(&authority.pubkey(), &authority_ata, amount));
    instructions
      .wsol_ata_ixs
      .push(sync_native(&TOKEN_PROGRAM_ID, &authority_ata)?);

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
    .chain(instructions.wsol_ata_ixs.into_iter())
    .chain(instructions.create_lending_position_ix.into_iter())
    .chain(std::iter::once(instructions.deposit_lending_ix))
    .chain(instructions.close_wsol_ata_ix.into_iter())
    .collect();

  create_and_send_transaction(&rpc, &authority, &mut instructions_array, None, None, None)
}
