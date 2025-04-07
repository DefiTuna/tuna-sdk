use dirs::home_dir;
use solana_client::rpc_client::RpcClient;
use solana_sdk::program_pack::Pack;
use solana_sdk::{
  commitment_config::CommitmentConfig, pubkey::Pubkey, signature::Keypair, signer::Signer,
};
use spl_token::state::Mint;
use std::error::Error;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use std::str::FromStr;

use crate::constants::WSOL_MINT;

pub fn load_wallet() -> Result<Box<dyn Signer>, Box<dyn Error>> {
  let home_dir = home_dir().ok_or("Could not determine home directory")?;
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

pub fn get_mint_decimals(
  rpc: &RpcClient,
  token_mint_address: &Pubkey,
) -> Result<u8, Box<dyn Error>> {
  let account_data = rpc.get_account_data(token_mint_address)?;
  let token_mint = Mint::unpack(&account_data)?;
  Ok(token_mint.decimals)
}

pub fn account_exists(rpc: &RpcClient, pubkey: &Pubkey) -> Result<bool, Box<dyn Error>> {
  let account = rpc.get_account_with_commitment(pubkey, CommitmentConfig::processed())?;

  if account.value.is_some() {
    return Ok(true);
  } else {
    return Ok(false);
  };
}

pub fn is_wsol_mint(token_mint_address: &Pubkey) -> Result<bool, Box<dyn Error>> {
  let wsol_mint_address = &Pubkey::from_str(WSOL_MINT)?;

  Ok(token_mint_address == wsol_mint_address)
}
