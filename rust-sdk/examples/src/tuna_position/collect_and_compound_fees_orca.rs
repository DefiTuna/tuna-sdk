use anyhow::Result;
use defituna_client::{
  collect_and_compound_fees_orca_instructions
};
use fusionamm_tx_sender::{send_smart_transaction, SmartTxConfig};
use solana_client::rpc_client::RpcClient;
use solana_sdk::signature::Keypair;
use solana_sdk::{pubkey::Pubkey, signer::Signer};
use std::sync::Arc;

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
  // Wheter to maintain the leverage multiplier by borrowing additional tokens from Tuna Lending Vaults to match the compounded fees.
  // For example, with fees of 0.005 Token A and 2.5 Token B and a leverage of 2, an equal amount is borrowed to keep the leverage consistent.
  // true for opting into keeping the leverage multiplier the same, and false otherwise.
  let use_leverage = true;

  // Creation of instructions for collecting and compounding fees;
  let instructions =
    collect_and_compound_fees_orca_instructions(&rpc, &authority.pubkey(), &tuna_position_mint, use_leverage)?;

  // Signing and sending the transaction with all the instructions to the Solana network.
  send_smart_transaction(
    &rpc.get_inner_client(),
    vec![Arc::new(authority.insecure_clone())],
    &authority.pubkey(),
    instructions,
    vec![],
    SmartTxConfig::default(),
  )
  .await?;

  Ok(())
}
