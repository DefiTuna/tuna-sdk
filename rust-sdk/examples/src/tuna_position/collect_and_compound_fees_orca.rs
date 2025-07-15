use crate::utils::fetch_address_lookup_table;
use anyhow::{anyhow, Result};
use defituna_client::accounts::{fetch_market, fetch_tuna_position};
use defituna_client::types::MarketMaker;
use defituna_client::{
  collect_and_compound_fees_orca_instructions, get_market_address, get_tuna_position_address, TUNA_ID,
};
use fusionamm_tx_sender::{send_smart_transaction, PriorityFeeLevel, SmartTxConfig, SmartTxPriorityFeeConfig};
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_rpc_client::rpc_client::RpcClient;
use solana_signer::Signer;
use std::sync::Arc;
use std::time::Duration;

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
pub async fn collect_and_compound_fees_orca(
  rpc: RpcClient,
  authority: &Keypair,
  tuna_position_mint: Pubkey,
) -> Result<()> {
  println!("Collecting and compounding fees...");

  // Wheter to maintain the leverage multiplier by borrowing additional tokens from Tuna Lending Vaults to match the compounded fees.
  // For example, with fees of 0.005 Token A and 2.5 Token B and a leverage of 2, an equal amount is borrowed to keep the leverage consistent.
  // true for opting into keeping the leverage multiplier the same, and false otherwise.
  let use_leverage = true;

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

  // Creation of instructions for collecting and compounding fees;
  let instructions =
    collect_and_compound_fees_orca_instructions(&rpc, &authority.pubkey(), &tuna_position_mint, use_leverage)?;

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
