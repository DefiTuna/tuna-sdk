use std::ops::Mul;
use std::{error::Error, str::FromStr};

use orca_whirlpools_client::Whirlpool;
use solana_client::rpc_client::RpcClient;
use solana_sdk::account::Account;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::Keypair;
use solana_sdk::{pubkey::Pubkey, signer::Signer};

use crate::constants::SOL_USDC_WHIRLPOOL;
use crate::errors::CustomError;
use crate::utils::common::{account_exists, get_mint_decimals};

struct Amounts<T> {
  a: T,
  b: T,
}

pub fn orca_open_position_and_add_liquidity(
  rpc: RpcClient,
  authority: Box<dyn Signer>,
) -> Result<(), Box<dyn Error>> {
  let nominal_collateral: Amounts<f64> = Amounts { a: 0.01, b: 0.1 };

  let leverage: u8 = 2;

  let borrow_ratio: Amounts<f64> = Amounts { a: 0.6, b: 0.4 };

  let whirlpool_pda = Pubkey::from_str(SOL_USDC_WHIRLPOOL)?;

  let new_position_mint_keypair = Keypair::new();

  let whirlpool_account =
    rpc.get_account_with_commitment(&whirlpool_pda, CommitmentConfig::processed())?;

  if whirlpool_account.value.is_none() {
    return Err(Box::new(CustomError::AccountNotFound(whirlpool_pda)));
  };

  let whirlpool_data = Whirlpool::from_bytes(&whirlpool_account.value.unwrap().data)?;

  let decimals: Amounts<u8> = Amounts {
    a: get_mint_decimals(&rpc, &whirlpool_data.token_mint_a)?,
    b: get_mint_decimals(&rpc, &whirlpool_data.token_mint_b)?,
  };

  let decimals_scale: Amounts<u32> = Amounts {
    a: 10u32.pow(decimals.a as u32),
    b: 10u32.pow(decimals.b as u32),
  };

  let collateral: Amounts<u64> = Amounts {
    a: nominal_collateral
      .a
      .mul(f64::try_from(decimals_scale.a)?)
      .round()
      .abs() as u64,
    b: nominal_collateral
      .b
      .mul(f64::try_from(decimals_scale.b)?)
      .round()
      .abs() as u64,
  };

  Ok(())
}
