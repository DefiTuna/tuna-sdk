mod constants;
mod lending;
mod tuna_position;
mod types;
mod utils;
use anyhow::{anyhow, Result};
use dotenv::{dotenv, var};
use lending::{
  open_lending_position_and_deposit::open_lending_position_and_deposit,
  retrieve_lending_positions::retrieve_user_lending_positions, withdraw::withdraw,
};
use solana_rpc_client::rpc_client::RpcClient;
use solana_signer::Signer;
use tuna_position::{
  close_position_with_liquidity_orca::close_position_with_liquidity_orca,
  collect_and_compound_fees_orca::collect_and_compound_fees_orca, collect_fees_orca::collect_fees_orca,
  open_position_with_liquidity_orca::open_position_with_liquidity_orca,
  retrieve_tuna_positions::retrieve_user_tuna_positions,
};

use utils::cli::{Args, Method};

#[tokio::main]
async fn main() -> Result<()> {
  dotenv().ok();
  let rpc_url = var("RPC_URL").map_err(|e| anyhow!("Error occurred when getting RPC_URL env var: {}", e))?;
  let rpc = RpcClient::new(rpc_url.to_string());

  let keypair = utils::keypair::load_keypair()?;

  let env_args: Vec<String> = std::env::args().collect();
  let args = Args::parse(&env_args)?;

  let method = args.method;
  let tuna_position_mint = args.tuna_position_mint;
  let user_address = args.user_address.unwrap_or(keypair.pubkey());

  match method {
    Method::OpenLendingPositionAndDeposit => open_lending_position_and_deposit(rpc, &keypair).await,
    Method::WithdrawFromLendingPosition => withdraw(rpc, &keypair).await,
    Method::OpenPositionWithLiquidityOrca => open_position_with_liquidity_orca(rpc, &keypair).await,
    Method::CollectFeesOrca => collect_fees_orca(rpc, &keypair, tuna_position_mint.unwrap()).await,
    Method::CollectAndCompoundFeesOrca => {
      collect_and_compound_fees_orca(rpc, &keypair, tuna_position_mint.unwrap()).await
    }
    Method::ClosePositionWithLiquidityOrca => {
      close_position_with_liquidity_orca(rpc, &keypair, tuna_position_mint.unwrap()).await
    }
    Method::RetrieveLendingPositions => retrieve_user_lending_positions(rpc, user_address).await,
    Method::RetrieveTunaPositions => retrieve_user_tuna_positions(rpc, user_address).await,
  }
}
