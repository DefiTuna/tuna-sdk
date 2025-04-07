use anyhow::Result;
use solana_account_decoder::UiAccountEncoding;
use solana_client::{
  rpc_client::RpcClient,
  rpc_config::{RpcAccountInfoConfig, RpcProgramAccountsConfig},
  rpc_filter::{Memcmp, MemcmpEncodedBytes, RpcFilterType},
};
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey};
use tuna_client::{self, accounts::LendingPosition};

/// Retrieves all Lending Positions belonging to the user.
///
/// # Parameters
/// - `rpc`: The `RpcClient` for interacting with the Solana blockchain.
/// - `user_address`: The `Pubkey` of the user to get positions for.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(())` if the transaction is successful, or an error if it fails.
pub fn retrieve_user_lending_positions(rpc: RpcClient, user_address: Pubkey) -> Result<()> {
  let memcmp = RpcFilterType::Memcmp(Memcmp::new(11, MemcmpEncodedBytes::Base58(user_address.to_string())));

  let config = RpcProgramAccountsConfig {
    filters: Some(vec![
      RpcFilterType::DataSize(u64::try_from(LendingPosition::LEN)?),
      memcmp,
    ]),
    account_config: RpcAccountInfoConfig {
      encoding: Some(UiAccountEncoding::Base64),
      data_slice: None,
      commitment: Some(CommitmentConfig::processed()),
      min_context_slot: None,
    },
    with_context: None,
    sort_results: None,
  };

  let accounts = rpc.get_program_accounts_with_config(&tuna_client::TUNA_ID, config)?;

  println!("Amount of positions: {}", accounts.len());

  let mut positions = Vec::new();
  for (pubkey, account) in accounts {
    let position = LendingPosition::from_bytes(&account.data)?;
    positions.push((pubkey, position));
  }

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
