use anyhow::Result;
use defituna_client::{withdraw_instructions, TUNA_ID};
use fusionamm_tx_sender::{send_smart_transaction, PriorityFeeLevel, SmartTxConfig, SmartTxPriorityFeeConfig};
use solana_keypair::Keypair;
use solana_program_pack::Pack;
use solana_rpc_client::rpc_client::RpcClient;
use solana_signer::Signer;
use spl_token::state::Mint;
use std::ops::Mul;
use std::sync::Arc;
use std::time::Duration;

pub async fn withdraw(rpc: RpcClient, authority: &Keypair) -> Result<()> {
  println!("Withdrawing the lending position...");

  // The address of the token mint to deposit/withdraw, identifying the target Tuna Lending Vault.
  // Set to the USDC token address in our examples;
  // There are methods in our sdk to fetch all available lending vaults and their respective mint addresses.
  let token_mint_address = spl_token::native_mint::ID;
  // Token Mint
  let token_mint_account = rpc.get_account(&token_mint_address)?;
  let token_mint = Mint::unpack(&token_mint_account.data)?;

  // The nominal amount to deposit, excluding Token decimals (e.g., 1 SOL as a flat value, or 0.5 SOL).
  let nominal_amount: f64 = 1.0;
  // The amount in lamports to deposit, including Token decimals (e.g. 1_000_000_000 SOL as a flat value for a whole unit of SOL)
  let amount = nominal_amount.mul(10_u64.pow(token_mint.decimals as u32) as f64) as u64;

  // The withdraw instruction interacts with the Tuna program to withdraw the funds into the lending position.
  // Here we have a choice to pass either funds or shares. For simplicity reasons we will use funds.
  let instructions = withdraw_instructions(&rpc, &authority.pubkey(), &token_mint_address, amount, 0)?;

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
    vec![],
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
