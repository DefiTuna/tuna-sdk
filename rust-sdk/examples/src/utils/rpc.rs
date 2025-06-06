use anyhow::{anyhow, bail, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
  address_lookup_table::{state::AddressLookupTable, AddressLookupTableAccount},
  commitment_config::CommitmentConfig,
  compute_budget::ComputeBudgetInstruction,
  hash::Hash,
  instruction::Instruction,
  message::{v0::Message as V0Message, Message, VersionedMessage},
  pubkey::Pubkey,
  signature::Keypair,
  signer::Signer,
  transaction::VersionedTransaction,
};
use std::{
  thread::sleep,
  time::{Duration, Instant},
};

use crate::constants::{MAX_CU_LIMIT, MIN_COMPUTE_UNIT_PRICE};

/// Constructs and sends a transaction on the Solana blockchain, signed by the provided keypair, with priority fees applied.
///
/// # Parameters
/// - `rpc`: The `RpcClient` for interacting with the Solana blockchain.
/// - `signer`: The authority signer authorizing the transaction.
/// - `instructions`:  An array of instructions to be executed by the transaction.
/// - `signing_keypairs`: An optional array of extra keypairs to sign the transaction.
/// - `address_lookup_table`: An optional addressLookupTable address for efficiently handling more addresses per transaction.
/// - `simulation`: An optional similation struct with the *computeUnitLimit* used in the transaction, which,
/// combined with a fetched *Priority Fee*, determines transaction prioritization.
/// If undefined, it’s estimated with a buffer (up to *MAX_CU_LIMIT*).
///
/// # Returns
/// - `Result<()>`: Returns `Ok(())` if the transaction is successful, or an error if it fails.
pub fn create_and_send_transaction(
  rpc: &RpcClient,
  signer: &Box<dyn Signer>,
  instructions: &mut Vec<Instruction>,
  signing_keypairs: Option<Vec<Keypair>>,
  address_lookup_table: Option<Pubkey>,
  compute_unit_limit: Option<u32>,
) -> Result<()> {

  let blockhash: Hash = rpc.get_latest_blockhash()?;

  if compute_unit_limit.is_none() {
    let set_compute_unit_limit_ix = ComputeBudgetInstruction::set_compute_unit_limit(
      compute_unit_limit
        .unwrap_or(
          MAX_CU_LIMIT,
        ),
    );

    let set_compute_unit_price_ix = ComputeBudgetInstruction::set_compute_unit_price(MIN_COMPUTE_UNIT_PRICE);

    instructions.insert(0, set_compute_unit_price_ix);
    instructions.insert(0, set_compute_unit_limit_ix);
  }

  let versioned_message = if let Some(lookup_table_pubkey) = address_lookup_table {
    let lookup_table_account_info = rpc.get_account(&lookup_table_pubkey)?;
    let lookup_table = AddressLookupTable::deserialize(&lookup_table_account_info.data)
      .map_err(|e| anyhow!("Failed to deserialize lookup table: {}", e))?;
    let lookup_table_account = AddressLookupTableAccount {
      key: lookup_table_pubkey,
      addresses: lookup_table.addresses.to_vec(),
    };

    VersionedMessage::V0(V0Message::try_compile(
      &signer.pubkey(),
      instructions,
      &[lookup_table_account],
      blockhash,
    )?)
  } else {
    let mut message = Message::new(&instructions, Some(&signer.pubkey()));
    message.recent_blockhash = blockhash;
    VersionedMessage::Legacy(message)
  };

  let keypairs_ref = signing_keypairs.as_ref();
  let mut all_signers: Vec<&dyn Signer> = vec![signer];
  if let Some(keypairs) = keypairs_ref {
    all_signers.extend(keypairs.iter().map(|kp| kp as &dyn Signer));
  }

  let transaction = VersionedTransaction::try_new(versioned_message, &all_signers)?;

  if compute_unit_limit.is_none() {
    let compute_unit_limit_new = simulate_transaction(&rpc, &transaction)?;

    return Ok(create_and_send_transaction(
      &rpc,
      &signer,
      instructions,
      signing_keypairs,
      address_lookup_table,
      Some(compute_unit_limit_new),
    )?);
  }

  let signature = rpc.send_transaction(&transaction)?;
  let commitment = CommitmentConfig::confirmed();

  let timeout = Duration::from_secs(120);
  let poll_interval = Duration::from_secs(5);
  let start_time = Instant::now();

  loop {
    if start_time.elapsed() > timeout {
      bail!("Transaction status check timed out");
    }

    let status = rpc.get_signature_status_with_commitment(&signature, commitment)?;

    match status {
      None => {
        sleep(poll_interval);
      }
      Some(inner_result) => match inner_result {
        Ok(()) => {
          println!("Transaction successful with signature: {}", signature.to_string());
          return Ok(());
        }
        Err(e) => {
          bail!("Transaction with signature {:?} failed: {:?}", signature, e);
        }
      },
    }
  }
}

/// Simulates a transaction on the Solana blockchain, calculating and returning the `computeUnitLimit` necessary for the transaction.
///
/// # Parameters
/// - `rpc`: The `RpcClient` for interacting with the Solana blockchain.
/// - `transaction`: The transaction to be simulated.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(SolanaTransactionSimulation)` with the `computeUnitLimit` value if the transaction is successful,
/// or an error if it fails.
pub fn simulate_transaction(
  rpc: &RpcClient,
  transaction: &VersionedTransaction,
) -> Result<u32> {
  let simulation = rpc.simulate_transaction(transaction)?;

  if let Some(units_consumed) = simulation.value.units_consumed {
    let temp = (units_consumed as u64 * 115) / 100;
    let compute_unit_limit_with_reserve = temp.min(MAX_CU_LIMIT as u64) as u32;
    Ok(compute_unit_limit_with_reserve)
  } else {
    bail!("Simulation failed")
  }
}
