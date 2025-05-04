use anyhow::{anyhow, Result};
use dirs::home_dir;
use solana_sdk::{signature::Keypair, signer::Signer};
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
