use std::fmt;

use solana_sdk::pubkey::Pubkey;

use crate::constants::VALID_METHODS;

#[derive(Debug)]
pub enum CustomError {
  AccountNotFound(Pubkey),
  InvalidCliMethod(String),
  MissingTunaPositionMint,
  NotEnoughCliArgs,
}

impl fmt::Display for CustomError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      CustomError::AccountNotFound(pubkey) => write!(
        f,
        "The account was not found for provided address {}",
        pubkey
      ),
      CustomError::InvalidCliMethod(method) => write!(
        f,
        "Unknown method: {}. Valid options: {}",
        method,
        VALID_METHODS.join(", ")
      ),
      CustomError::MissingTunaPositionMint => write!(
        f,
        "Please specify a tuna_position_mint address for this method"
      ),
      CustomError::NotEnoughCliArgs => write!(
        f,
        "Usage: <method> [tuna_position_mint]\nExample: deposit_and_create mint123"
      ),
    }
  }
}

impl std::error::Error for CustomError {}
