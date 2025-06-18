use anyhow::Result;
use defituna_client::collect_fees_orca_instructions;
use fusionamm_tx_sender::{send_smart_transaction, SmartTxConfig};
use solana_client::rpc_client::RpcClient;
use solana_sdk::signature::Keypair;
use solana_sdk::{pubkey::Pubkey, signer::Signer};
use std::sync::Arc;

/// Collects fees from an Orca position, managed via Orca's Whirlpools smart contract.
///
/// Uses the SOL/USDC Whirlpool for this example; these can be adjusted or passed through the function’s input.
///
/// # Parameters
/// - `rpc`: The `RpcClient` for interacting with the Solana blockchain.
/// - `authority`: The authority `Box<dyn Signer>` who owns the position.
/// - `tuna_position_mint`: The `Pubkey` of the Tuna Position Mint identifying the position from which to collect and compound fees.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(())` if the transaction is successful, or an error if it fails.
pub async fn collect_fees_orca(rpc: RpcClient, authority: &Keypair, tuna_position_mint: Pubkey) -> Result<()> {
  // Creation of instructions for collecting fees
  let instructions = collect_fees_orca_instructions(&rpc, &authority.pubkey(), &tuna_position_mint)?;

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
