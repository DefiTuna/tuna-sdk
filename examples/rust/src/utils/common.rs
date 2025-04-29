use anyhow::{anyhow, Result};
use dirs::home_dir;
use solana_client::rpc_client::RpcClient;
use solana_sdk::program_pack::Pack;
use solana_sdk::{pubkey::Pubkey, signature::Keypair, signer::Signer};
use spl_token::state::Mint;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

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
