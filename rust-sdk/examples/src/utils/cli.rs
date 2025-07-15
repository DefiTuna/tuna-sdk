use crate::constants::VALID_METHODS;
use anyhow::{bail, Result};
use solana_pubkey::Pubkey;
use std::str::FromStr;

#[derive(PartialEq)]
pub enum Method {
  OpenLendingPositionAndDeposit,
  WithdrawFromLendingPosition,
  CollectAndCompoundFeesOrca,
  CollectFeesOrca,
  OpenPositionWithLiquidityOrca,
  ClosePositionWithLiquidityOrca,
  RetrieveLendingPositions,
  RetrieveTunaPositions,
}
impl Method {
  fn from_str(s: &str) -> Result<Self> {
    match s.to_lowercase().as_str() {
      "deposit_and_create" => Ok(Self::OpenLendingPositionAndDeposit),
      "withdraw" => Ok(Self::WithdrawFromLendingPosition),
      "open_position_with_liquidity_orca" => Ok(Self::OpenPositionWithLiquidityOrca),
      "collect_fees_orca" => Ok(Self::CollectFeesOrca),
      "collect_and_compound_fees_orca" => Ok(Self::CollectAndCompoundFeesOrca),
      "close_position_with_liquidity_orca" => Ok(Self::ClosePositionWithLiquidityOrca),
      "retrieve_lending_positions" => Ok(Self::RetrieveLendingPositions),
      "retrieve_tuna_positions" => Ok(Self::RetrieveTunaPositions),
      _ => bail!("Unknown method: {}. Valid options: {}", s, VALID_METHODS.join(", ")),
    }
  }
}
fn is_tuna_position_mint_dependent(m: &Method) -> bool {
  matches!(
    m,
    Method::CollectAndCompoundFeesOrca | Method::CollectFeesOrca | Method::ClosePositionWithLiquidityOrca
  )
}
fn is_positions_retrieval(m: &Method) -> bool {
  matches!(m, Method::RetrieveLendingPositions | Method::RetrieveTunaPositions)
}

pub struct Args {
  pub method: Method,
  pub tuna_position_mint: Option<Pubkey>,
  pub user_address: Option<Pubkey>,
}

impl Args {
  pub fn parse(args: &[String]) -> Result<Self> {
    if args.len() < 2 {
      bail!("Usage: <method> [tuna_position_mint]\nExample: deposit_and_create mint123");
    }

    let method = Method::from_str(&args[1])?;

    let tuna_position_dependent = is_tuna_position_mint_dependent(&method);

    let tuna_position_mint = if args.len() > 2 && tuna_position_dependent {
      Some(Pubkey::from_str(&args[2])?)
    } else {
      None
    };

    if tuna_position_dependent && tuna_position_mint.is_none() {
      bail!("Please specify a tuna_position_mint address for this method");
    }

    let user_address = if args.len() > 2 && is_positions_retrieval(&method) {
      Some(Pubkey::from_str(&args[2])?)
    } else {
      None
    };

    Ok(Args {
      method,
      tuna_position_mint,
      user_address,
    })
  }
}
