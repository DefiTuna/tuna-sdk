use crate::{types::Amounts, utils::rpc::create_and_send_transaction};
use anyhow::Result;
use defituna_client::{
  accounts::{fetch_market, fetch_tuna_position},
  close_position_with_liquidity_orca_instructions, get_market_address, get_tuna_position_address,
  ClosePositionWithLiquidityOrcaArgs,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signer::Signer};

/// Removes liquidity from a position in an Orca liquidity pool and closes it, managing funds via Tuna's smart contract.
///
/// This function uses the SOL/USDC Whirlpool with preset withdrawal amounts and swap options. These presets can be adjusted or passed through the function’s input.
///
/// **Note:** This function combines opening and removing liquidity, though these actions can be performed separately. Liquidity can be removed multiple times based on the available liquidity in the Orca position.
///
/// # Parameters
/// - `rpc`: The `RpcClient` for interacting with the Solana blockchain.
/// - `authority`: The authority `Signer` who owns the position.
/// - `tuna_position_mint`: The `Pubkey` of the Tuna Position Mint identifying the position to manage.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(())` if the transaction is successful, or an error if it fails.
pub fn close_position_with_liquidity_orca(
  rpc: RpcClient,
  authority: Box<dyn Signer>,
  tuna_position_mint: Pubkey,
) -> Result<()> {
  // The Tuna Position Account containing deserialized data, fetched using Tuna's Client.
  let tuna_position = fetch_tuna_position(&rpc, &get_tuna_position_address(&tuna_position_mint).0)?;

  // The Market Account containing deserialized data, fetched using Tuna's Client.
  let market = fetch_market(&rpc, &get_market_address(&tuna_position.data.pool).0)?;

  // Minimum removed amounts for Tokens A and B to be respected by the RemoveLiquidity instruction, acting as slippage limits.
  let min_removed_amount = Amounts { a: 0, b: 0 };
  // The total amount of slippage allowed on the Whirlpool's price during potential inner swaps due to deposit ratio rebalancing.
  let max_swap_slippage = 0;
  // The option for whether to swap and which token to swap to during RemoveLiquidity.
  // - 0 - No swap
  // - 1 - Swaps to Token A
  // - 2 - Swaps to Token B
  let swap_to_token = 1;

  // Creation of instructions for removing liquidity and closing positions;
  let args = ClosePositionWithLiquidityOrcaArgs {
    swap_to_token,
    min_removed_amount_a: min_removed_amount.a,
    min_removed_amount_b: min_removed_amount.b,
    max_swap_slippage,
  };

  let mut instructions =
    close_position_with_liquidity_orca_instructions(&rpc, &authority.pubkey(), &tuna_position_mint, args)?;

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
