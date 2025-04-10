mod constants;
mod errors;
mod lending;
mod tuna_position;
mod utils;
use dotenv::{dotenv, var};
use lending::{deposit_and_create::deposit_and_create, withdraw::withdraw};
use solana_client::rpc_client::RpcClient;
use std::error::Error;
use tuna_position::open_and_add_liquidity_orca::orca_open_position_and_add_liquidity;

use utils::cli::{Args, Method};

fn main() -> Result<(), Box<dyn Error>> {
  dotenv().ok();
  let rpc_url =
    var("RPC_URL").map_err(|e| format!("Error occurred when getting RPC_URL env var: {}", e))?;
  let rpc = RpcClient::new(rpc_url.to_string());

  let env_args: Vec<String> = std::env::args().collect();
  let args = Args::parse(&env_args)?;

  let method = args.method;
  let _tuna_position_mint = args.tuna_position_mint;

  let wallet = utils::common::load_wallet()?;

  match method {
    Method::DepositAndCreate => deposit_and_create(rpc, wallet),
    Method::Withdraw => withdraw(rpc, wallet),
    Method::OpenAndAddLiquidityOrca => orca_open_position_and_add_liquidity(rpc, wallet),
    Method::CollectFeesOrca => Ok(()),
    Method::CollectAndCompoundFeesOrca => Ok(()),
    Method::RemoveLiquidityAndCloseOrca => Ok(()),
  }
}
