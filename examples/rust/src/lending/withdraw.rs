use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{instruction::Instruction, signer::Signer};
use spl_associated_token_account::{instruction::create_associated_token_account, ID as ASSOCIATED_TOKEN_PROGRAM_ID};
use spl_token::{instruction::close_account, ID as TOKEN_PROGRAM_ID};
use defituna_client::instructions::WithdrawBuilder;

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

pub fn withdraw(rpc: RpcClient, authority: Box<dyn Signer>) -> Result<()> {
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

  // The withdraw instruction interacts with the Tuna program to withdraw the funds into the lending position.
  // Here we have a choice to pass either funds or shares. For simplicity reasons we will use funds.
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

  // The instructions object contains all the instructions required and optional to withdraw from a Lending Position.
  let mut instructions = WithdrawLendingPositionInstructions {
    withdraw_lending_ix: withdraw_lending_builder.instruction(),
    create_ata_ix: None,
    close_wsol_ata_ix: None,
  };

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

  // If the token mint is WSOL (Wrapped SOL), we need to ensure any remaining SOL is returned to the owner, by closing the ATA.
  if is_wsol_mint(&token_mint_address)? {
    instructions.close_wsol_ata_ix = Some(close_account(
      &TOKEN_PROGRAM_ID,
      &authority_ata,
      &authority.pubkey(),
      &authority.pubkey(),
      &[&authority.pubkey()],
    )?);
  }

  // The instructions array contains all the instructions required to withdraw from a Lending Position.
  // We filter out any null instructions that are not required.
  let mut instructions_array: Vec<Instruction> = instructions
    .create_ata_ix
    .into_iter()
    .chain(std::iter::once(instructions.withdraw_lending_ix))
    .chain(instructions.close_wsol_ata_ix.into_iter())
    .collect();

  // We sign and send the transaction to the network, which will withdraw from the Lending Position.
  create_and_send_transaction(&rpc, &authority, &mut instructions_array, None, None, None)
}
