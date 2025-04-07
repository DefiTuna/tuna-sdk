use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
  feature_set::rent_for_sysvars::ID as RENT_SYSVAR_ID, instruction::Instruction,
  signer::Signer, system_instruction::transfer, system_program::ID as SYSTEM_PROGRAM_ID,
};
use spl_associated_token_account::{instruction::create_associated_token_account, ID as ASSOCIATED_TOKEN_PROGRAM_ID};
use spl_token::{
  instruction::{close_account, sync_native},
  ID as TOKEN_PROGRAM_ID,
};
use tuna_client::instructions::{CreateLendingPositionBuilder, DepositBuilder};

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

pub fn deposit_and_create(rpc: RpcClient, authority: Box<dyn Signer>) -> Result<()> {
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

  // The deposit instruction interacts with the Tuna program to deposit the funds into the Lending Position.
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

  // The instructions object contains all the instructions required and optional to create and deposit into a Lending Position.
  let mut instructions = CreateAndDepositLendingPositionInstructions {
    deposit_lending_ix: deposit_lending_builder.instruction(),
    create_lending_position_ix: None,
    create_ata_ix: None,
    wsol_ata_ixs: vec![],
    close_wsol_ata_ix: None,
  };

  // If the Lending Position doesn't exist, we need to create it. We rely on the create instruction from the Tuna program.
  if account_exists(&rpc, &lending_position_pda)? {
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

  // If the authority ATA doesn't exist, we need to create it. We rely on the createATA instruction from Solana's Token program.
  // This is specially important when the token mint is WSOL, since we must always create it before transferring to and from it.
  if account_exists(&rpc, &authority_ata)? {
    instructions.create_ata_ix = Some(create_associated_token_account(
      &authority.pubkey(),
      &authority.pubkey(),
      &token_mint_address,
      &TOKEN_PROGRAM_ID,
    ));
  }

  // If the token mint is WSOL (Wrapped SOL), we need to handle the deposit differently.
  // Because WSOL is essentially SOL wrapped in an SPL Token, we need to transfer the SOL to an ATA,
  // after which we can deposit it into the lending position.
  // We also add a sync instruction to ensure the ATA is up-to-date and the transferred funds are available for deposit.
  // Finally, it's important to close the ATA in case any SOL remains in it, returning it to the owner.
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

  // The instructions array contains all the instructions required to create and deposit into a Lending Position.
  // We filter out any null instructions that are not required.
  let mut instructions_array: Vec<Instruction> = instructions
    .create_ata_ix
    .into_iter()
    .chain(instructions.wsol_ata_ixs.into_iter())
    .chain(instructions.create_lending_position_ix.into_iter())
    .chain(std::iter::once(instructions.deposit_lending_ix))
    .chain(instructions.close_wsol_ata_ix.into_iter())
    .collect();

  // We sign and send the transaction to the network, which will create (if necessary) and deposit into the Lending Position.
  create_and_send_transaction(&rpc, &authority, &mut instructions_array, None, None, None)
}
