use dirs::home_dir;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::program_pack::Pack;
use solana_sdk::{pubkey::Pubkey, signature::Keypair, signer::Signer};
use spl_token::state::Mint;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use std::str::FromStr;
use defituna_client::accounts::{fetch_vault};

use crate::constants::WSOL_MINT;
use anyhow::{anyhow, Result};

pub fn load_wallet() -> Result<Box<dyn Signer>> {
  let home_dir = home_dir().ok_or(anyhow!("Could not determine home directory"))?;
  let mut keypair_path = PathBuf::from(home_dir);
  keypair_path.push(".config");
  keypair_path.push("solana");
  keypair_path.push("id.json");

  let mut file = File::open(&keypair_path)?;
  let mut contents = String::new();
  file.read_to_string(&mut contents)?;

  let keypair_bytes: Vec<u8> = serde_json::from_str(&contents)?;

  let keypair = Keypair::from_bytes(&keypair_bytes)?;

  Ok(Box::new(keypair) as Box<dyn Signer>)
}

/// Fetches the Mint Account for the `tokenMintAddress` provided and returns the decimals from the Account's data.
///
/// # Parameters
/// - `rpc` - The `RpcClient` for Solana blockchain interactions.
/// - `token_mint_address` - The `Pubkey` of the Mint account to be fetched.
///
/// # Returns
/// - `Result<u8>`: Returns `Ok(u8)` if the function is successful, or an error if it fails.
pub fn get_mint_decimals(rpc: &RpcClient, token_mint_address: &Pubkey) -> Result<u8> {
  let account_data = rpc.get_account_data(token_mint_address)?;
  let token_mint = Mint::unpack(&account_data)?;
  Ok(token_mint.decimals)
}

/// Fetches the AccountInfo for the address provided and returns true if account exists and false otherwise.
///
/// # Parameters
/// - `rpc` - The `RpcClient` for Solana blockchain interactions.
/// - `pubkey` - The `Pubkey` of the account to be fetched.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(bool)` representing whether the account exists or not, if the method is successful, or an error if it fails.
pub fn account_exists(rpc: &RpcClient, address: &Pubkey) -> Result<bool> {
  Ok(
    rpc
      .get_account_with_commitment(address, CommitmentConfig::processed())?
      .value
      .is_some(),
  )
}

/// Fetches the Lending Vault Account for the `lendingVaultAddress` provided and returns the `pythOraclePriceUpdate` address from the Account's data.
///
/// # Parameters
/// - `rpc` - The `RpcClient` for Solana blockchain interactions.
/// - `lending_vault_address` - The `Pubkey` of the lendingVaultAddress account to be fetched.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(Pubkey)` representing the address of the pythOraclePriceUpdate,
/// if the method is successful, or an error if it fails.
pub fn get_pyth_oracle_price_feed(rpc: &RpcClient, lending_vault_address: &Pubkey) -> Result<Pubkey> {
  let vault_account = fetch_vault(rpc, &lending_vault_address)?;
  Ok(vault_account.data.pyth_oracle_price_update)
}

/// Checks if a token or address corresponds to the Wrapped SOL (*WSOL*) mint account.
///
/// # Parameters
/// - `rpc` - The `RpcClient` for Solana blockchain interactions.
/// - `token_mint_address` - The `Pubkey` of the token to be checked.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(bool)` representing whether the token is wsol or not,
/// if the method is successful, or an error if it fails.
pub fn is_wsol_mint(token_mint_address: &Pubkey) -> Result<bool> {
  let wsol_mint_address = &Pubkey::from_str(WSOL_MINT)?;

  Ok(token_mint_address == wsol_mint_address)
}
