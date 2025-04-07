use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signer::Signer};
use spl_associated_token_account::get_associated_token_address;
use std::{ops::Mul, str::FromStr};
use tuna_client::{get_lending_position_address, get_tuna_config_address, get_vault_address};

use super::common::get_mint_decimals;

pub struct LendingAccountsAndParameters {
  pub token_mint_address: Pubkey,
  pub amount: u64,
  pub tuna_config_pda: Pubkey,
  pub vault_pda: Pubkey,
  pub lending_position_pda: Pubkey,
  pub authority_ata: Pubkey,
  pub vault_ata: Pubkey,
}

/// Prepares accounts and parameters for Tuna *Lending Pool* operations on the Solana blockchain.
///
/// # Parameters
/// - `rpc`: The `RpcClient` for interacting with the Solana blockchain.
/// - `authority`: The authority `Box<dyn Signer>` who owns the position.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(LendingAccountsAndParameters)` with all parameters required for
/// Tuna *Lending Pool* operations, if the transaction is successful, or an error if it fails.
pub fn prepare_lending_accounts_and_parameters(
  rpc: &RpcClient,
  authority: &Box<dyn Signer>,
) -> Result<LendingAccountsAndParameters> {
  // Define variables and accounts for Tuna *lending* operations;

  // The address of the token mint to deposit/withdraw, identifying the target Tuna Lending Vault.
  // Set to the USDC token address in our examples;
  // There are methods in our sdk to fetch all available lending vaults and their respective mint addresses.
  let token_mint_address: Pubkey = Pubkey::from_str("So11111111111111111111111111111111111111112")?;
  // The nominal amount to deposit, excluding Token decimals (e.g., 1 SOL as a flat value, or 0.5 SOL).
  let nominal_amount: f64 = 1.0;
  // Fetches token decimals for the Token, using Whirlpool Client.
  let decimals = get_mint_decimals(rpc, &token_mint_address)?;
  // The amount in lamports to deposit, including Token decimals (e.g. 1_000_000_000 SOL as a flat value for a whole unit of SOL)
  let amount = nominal_amount
    .mul(f64::try_from(10_u32.pow(decimals as u32))?)
    .round()
    .abs() as u64;
  // The Tuna Config Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_config_pda, _) = get_tuna_config_address();
  // The Lending Vault  Program Derived address, fetched from the Tuna Client.
  // Derived from the token mint address.
  let (vault_pda, _) = get_vault_address(&token_mint_address);
  // The Lending Position Program Derived address, fetched from the Tuna Client.
  // Derived from the authority (user) address and the token mint address.
  let (lending_position_pda, _) = get_lending_position_address(&authority.pubkey(), &token_mint_address);
  // The Associated Token Address, owned by the authority.
  let authority_ata = get_associated_token_address(&authority.pubkey(), &token_mint_address);
  // The Associated Token Address, owned by the Lending Vault.
  let vault_ata = get_associated_token_address(&vault_pda, &token_mint_address);

  Ok(LendingAccountsAndParameters {
    token_mint_address,
    amount,
    tuna_config_pda,
    vault_pda,
    lending_position_pda,
    authority_ata,
    vault_ata,
  })
}
