use crate::utils::rpc::create_and_send_transaction;
use anyhow::Result;
use defituna_client::accounts::fetch_tuna_position;
use defituna_client::{
  accounts::fetch_market, collect_and_compound_fees_orca_instructions, get_market_address, get_tuna_position_address,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signer::Signer};

/// Collects fees from an Orca position and compounds them back into the position via Tuna's smart contract.
///
/// Uses the SOL/USDC Whirlpool with preset compounding settings for this example; these can be adjusted or passed through the function’s input.
///
/// # Parameters
/// - `rpc`: The `RpcClient` for interacting with the Solana blockchain.
/// - `authority`: The authority `Box<dyn Signer>` who owns the position.
/// - `tuna_position_mint`: The `Pubkey` of the Tuna Position Mint identifying the position from which to collect and compound fees.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(())` if the transaction is successful, or an error if it fails.
pub fn collect_and_compound_fees_orca(
  rpc: RpcClient,
  authority: Box<dyn Signer>,
  tuna_position_mint: Pubkey,
) -> Result<()> {
  // The Tuna Position Account containing deserialized data, fetched using Tuna's Client.
  let tuna_position = fetch_tuna_position(&rpc, &get_tuna_position_address(&tuna_position_mint).0)?;

  // The Market Account containing deserialized data, fetched using Tuna's Client.
  let market = fetch_market(&rpc, &get_market_address(&tuna_position.data.pool).0)?;

  // Wheter to maintain the leverage multiplier by borrowing additional tokens from Tuna Lending Vaults to match the compounded fees.
  // For example, with fees of 0.005 Token A and 2.5 Token B and a leverage of 2, an equal amount is borrowed to keep the leverage consistent.
  // true for opting into keeping the leverage multiplier the same, and false otherwise.
  let use_leverage = true;

  // Creation of instructions for collecting and compounding fees;
  let mut instructions =
    collect_and_compound_fees_orca_instructions(&rpc, &authority.pubkey(), &tuna_position_mint, use_leverage)?;

  // Signing and sending the transaction with all the instructions to the Solana network.
  create_and_send_transaction(
    &rpc,
    &authority,
    &mut instructions,
    None,
    Some(market.data.address_lookup_table),
    None,
  )
}
