use crate::types::Amounts;
use crate::utils::fetch_address_lookup_table;
use anyhow::{anyhow, Result};
use defituna_client::accounts::{fetch_market, fetch_tuna_position};
use defituna_client::types::MarketMaker;
use defituna_client::{
  close_position_with_liquidity_orca_instructions, get_market_address, get_tuna_position_address,
  ClosePositionWithLiquidityOrcaArgs, TUNA_ID,
};
use fusionamm_tx_sender::{send_smart_transaction, PriorityFeeLevel, SmartTxConfig, SmartTxPriorityFeeConfig};
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_rpc_client::rpc_client::RpcClient;
use solana_signer::Signer;
use std::sync::Arc;
use std::time::Duration;

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
pub async fn close_position_with_liquidity_orca(
  rpc: RpcClient,
  authority: &Keypair,
  tuna_position_mint: Pubkey,
) -> Result<()> {
  println!("Close the position with liquidity...");

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

  let instructions =
    close_position_with_liquidity_orca_instructions(&rpc, &authority.pubkey(), &tuna_position_mint, args)?;

  // Almost all tuna transactions require the address lookup table to make the tx size smaller.
  // The LUT address is stored in the market account.
  let tuna_position_address = get_tuna_position_address(&tuna_position_mint).0;
  let tuna_position = fetch_tuna_position(&rpc, &tuna_position_address)?;
  if tuna_position.data.market_maker != MarketMaker::Orca {
    return Err(anyhow!("The example requires a position opened in an Orca pool..."));
  }
  let market_address = get_market_address(&tuna_position.data.pool).0;
  let market = fetch_market(&rpc, &market_address)?;
  let market_lut = fetch_address_lookup_table(&rpc, &market.data.address_lookup_table)?;

  // 'send_smart_transaction' requires a non-blocking rpc client, so we create it here.
  // However, it's not recommended to create the client each time—initialize it once and reuse it.
  let nonblocking_rpc = solana_rpc_client::nonblocking::rpc_client::RpcClient::new(rpc.url());

  println!("Sending a transaction...");

  // Configure the transaction to use a priority fee.
  let tx_config = SmartTxConfig {
    priority_fee: Some(SmartTxPriorityFeeConfig {
      additional_addresses: vec![TUNA_ID],
      fee_level: PriorityFeeLevel::Low,
      fee_min: 1000,
      fee_max: 100000000, // 0.001 SOL
    }),
    jito: None,
    default_compute_unit_limit: 800_000,
    compute_unit_margin_multiplier: 1.15,
    ingore_simulation_error: false,
    sig_verify_on_simulation: false,
    transaction_timeout: Some(Duration::from_secs(60)),
  };

  // Finally send the transaction.
  let result = send_smart_transaction(
    &nonblocking_rpc,
    vec![Arc::new(authority.insecure_clone())],
    &authority.pubkey(),
    instructions,
    vec![market_lut],
    tx_config,
  )
  .await?;

  println!("Transaction signature: {}", result.signature);
  println!(
    "Transaction priority fee: {} micro-lamports per cu",
    result.priority_fee
  );
  Ok(())
}
