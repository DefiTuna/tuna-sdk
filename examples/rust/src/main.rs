mod constants;
mod lending;
mod tuna_position;
mod types;
mod utils;
use anyhow::{anyhow, Result};
use dotenv::{dotenv, var};
use lending::{
  deposit_and_create::deposit_and_create, retrieve_lending_positions::retrieve_user_lending_positions,
  withdraw::withdraw,
};
use solana_client::rpc_client::RpcClient;
use tuna_position::{
  collect_and_compound_fees_orca::collect_and_compound_fees, collect_fees_orca::collect_fees,
  open_and_add_liquidity_orca::open_position_and_add_liquidity,
  remove_liquidity_and_close_orca::remove_liquidity_and_close, retrieve_tuna_positions::retrieve_user_tuna_positions,
};

use utils::cli::{Args, Method};

fn main() -> Result<()> {
  dotenv().ok();
  let rpc_url = var("RPC_URL").map_err(|e| anyhow!("Error occurred when getting RPC_URL env var: {}", e))?;
  let rpc = RpcClient::new(rpc_url.to_string());

  let wallet = utils::common::load_wallet()?;

  let env_args: Vec<String> = std::env::args().collect();
  let args = Args::parse(&env_args)?;

  let method = args.method;
  let tuna_position_mint = args.tuna_position_mint;
  let user_address = args.user_address.unwrap_or(wallet.pubkey());

  match method {
    Method::DepositAndCreate => deposit_and_create(rpc, wallet),
    Method::Withdraw => withdraw(rpc, wallet),
    Method::OpenAndAddLiquidityOrca => open_position_and_add_liquidity(rpc, wallet),
    Method::CollectFeesOrca => collect_fees(rpc, wallet, tuna_position_mint.unwrap()),
    Method::CollectAndCompoundFeesOrca => collect_and_compound_fees(rpc, wallet, tuna_position_mint.unwrap()),
    Method::RemoveLiquidityAndCloseOrca => remove_liquidity_and_close(rpc, wallet, tuna_position_mint.unwrap()),
    Method::RetrieveLendingPositions => retrieve_user_lending_positions(rpc, user_address),
    Method::RetrieveTunaPositions => retrieve_user_tuna_positions(rpc, user_address),
  }
}
