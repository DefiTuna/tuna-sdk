use anyhow::Result;
use defituna_client::{self, fetch_all_tuna_position_with_filter, TunaPositionFilter};
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;

/// Retrieves all Tuna Positions belonging to the user.
///
/// # Parameters
/// - `rpc`: The `RpcClient` for interacting with the Solana blockchain.
/// - `user_address`: The `Pubkey` of the user to get positions for.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(())` if the transaction is successful, or an error if it fails.
pub fn retrieve_user_tuna_positions(rpc: RpcClient, user_address: Pubkey) -> Result<()> {
  let filters = vec![TunaPositionFilter::Authority(user_address)];

  let positions = fetch_all_tuna_position_with_filter(&rpc, filters).map_err(|e| anyhow::anyhow!(e.to_string()))?;

  println!("Amount of positions: {}", positions.len());

  if positions.len() == 0 {
    println!("No positions found for user address {}", user_address);
  } else {
    positions
      .iter()
      .enumerate()
      .for_each(|(index, pos)| println!("Position {}: {:?}", index, pos));
  }

  Ok(())
}
