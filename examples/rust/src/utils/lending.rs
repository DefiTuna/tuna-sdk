use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signer::Signer};
use spl_associated_token_account::get_associated_token_address;
use std::{error::Error, ops::Mul, str::FromStr};
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

pub fn prepare_lending_accounts_and_parameters(
  rpc: &RpcClient,
  authority: &Box<dyn Signer>,
) -> Result<LendingAccountsAndParameters, Box<dyn Error>> {
  let token_mint_address: Pubkey = Pubkey::from_str("So11111111111111111111111111111111111111112")?;

  let nominal_amount: f64 = 1.0;

  let decimals = get_mint_decimals(rpc, &token_mint_address)?;

  println!("decimals {}", decimals);

  let amount = nominal_amount
    .mul(f64::try_from(10_u32.pow(decimals as u32))?)
    .round()
    .abs() as u64;

  let (tuna_config_pda, _) = get_tuna_config_address();

  let (vault_pda, _) = get_vault_address(&token_mint_address);

  let (lending_position_pda, _) =
    get_lending_position_address(&authority.pubkey(), &token_mint_address);

  let authority_ata = get_associated_token_address(&authority.pubkey(), &token_mint_address);
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
