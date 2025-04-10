use solana_sdk::pubkey::Pubkey;
use std::error::Error;
use std::str::FromStr;

use crate::errors::CustomError;

#[derive(PartialEq)]
pub enum Method {
  DepositAndCreate,
  Withdraw,
  CollectAndCompoundFeesOrca,
  CollectFeesOrca,
  OpenAndAddLiquidityOrca,
  RemoveLiquidityAndCloseOrca,
}
impl Method {
  fn from_str(s: &str) -> Result<Self, Box<dyn Error>> {
    match s.to_lowercase().as_str() {
      "deposit_and_create" => Ok(Self::DepositAndCreate),
      "withdraw" => Ok(Self::Withdraw),
      "open_and_add_liquidity_orca" => Ok(Self::OpenAndAddLiquidityOrca),
      "collect_fees_orca" => Ok(Self::CollectFeesOrca),
      "collect_and_compound_fees_orca" => Ok(Self::CollectAndCompoundFeesOrca),
      "remove_liquidity_and_close_orca" => Ok(Self::RemoveLiquidityAndCloseOrca),
      _ => return Err(Box::new(CustomError::InvalidCliMethod(s.to_string()))),
    }
  }
}
fn is_tuna_position_mint_dependent(m: &Method) -> bool {
  matches!(
    m,
    Method::CollectAndCompoundFeesOrca
      | Method::CollectFeesOrca
      | Method::RemoveLiquidityAndCloseOrca
  )
}

pub struct Args {
  pub method: Method,
  pub tuna_position_mint: Option<Pubkey>,
}

impl Args {
  pub fn parse(args: &[String]) -> Result<Self, Box<dyn Error>> {
    if args.len() < 2 {
      return Err(Box::new(CustomError::NotEnoughCliArgs));
    }

    let method = Method::from_str(&args[1])?;

    let tuna_position_mint = if args.len() > 2 {
      Some(Pubkey::from_str(&args[2])?)
    } else {
      None
    };

    if is_tuna_position_mint_dependent(&method) && tuna_position_mint.is_none() {
      return Err(Box::new(CustomError::MissingTunaPositionMint));
    }

    Ok(Args {
      method,
      tuna_position_mint,
    })
  }
}
