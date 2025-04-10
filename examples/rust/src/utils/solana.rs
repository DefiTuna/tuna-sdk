use solana_client::rpc_client::RpcClient;
use solana_sdk::{
  address_lookup_table::state::AddressLookupTable, compute_budget::ComputeBudgetInstruction,
  hash::Hash, instruction::Instruction, message::Message, signature::Keypair, signer::Signer,
  transaction::Transaction,
};
use std::error::Error;

use crate::constants::{MAX_CU_LIMIT, MIN_COMPUTE_UNIT_PRICE};

#[derive(Clone)]
pub struct SolanaTransactionSimulation {
  compute_unit_limit: u32,
}

pub fn create_and_send_transaction(
  rpc: &RpcClient,
  signer: &Box<dyn Signer>,
  instructions: &mut Vec<Instruction>,
  signing_keypairs: Option<Keypair>,
  _address_lookup_table: Option<AddressLookupTable>,
  simulation: Option<SolanaTransactionSimulation>,
) -> Result<(), Box<dyn Error>> {
  let blockhash = rpc.get_latest_blockhash()?;

  if simulation.clone().is_none() {
    let simulation = simulate_transaction(&rpc, &instructions, &signer, blockhash, None)?;

    return Ok(create_and_send_transaction(
      &rpc,
      &signer,
      instructions,
      None,
      None,
      Some(simulation),
    )?);
  }

  let set_compute_unit_limit_ix = ComputeBudgetInstruction::set_compute_unit_limit(
    simulation
      .unwrap_or(SolanaTransactionSimulation {
        compute_unit_limit: MAX_CU_LIMIT,
      })
      .clone()
      .compute_unit_limit,
  );

  let set_compute_unit_price_ix =
    ComputeBudgetInstruction::set_compute_unit_price(MIN_COMPUTE_UNIT_PRICE);

  instructions.insert(0, set_compute_unit_price_ix);
  instructions.insert(0, set_compute_unit_limit_ix);

  let message = Message::new(&instructions, Some(&signer.pubkey()));

  let mut transaction = Transaction::new_unsigned(message);

  let blockhash = rpc.get_latest_blockhash()?;
  transaction.partial_sign(&[signer], blockhash);

  if signing_keypairs.is_some() {
    transaction.partial_sign(&signing_keypairs, blockhash);
  }

  let simulation = rpc.simulate_transaction(&transaction)?;

  if let Some(err) = simulation.value.err {
    println!("Simulation failed with error: {:?}", err)
  } else {
    println!("Simulation succeeded. Logs: {:?}", simulation.value.logs);
  }
  // rpc.send_and_confirm_transaction(&tx)?;

  Ok(())
}

pub fn simulate_transaction(
  rpc: &RpcClient,
  instructions: &Vec<Instruction>,
  signer: &Box<dyn Signer>,
  blockhash: Hash,
  failed_attempts: Option<u8>,
) -> Result<SolanaTransactionSimulation, Box<dyn Error>> {
  let failed_attempts = failed_attempts.unwrap_or(0);

  let transaction =
    Transaction::new_signed_with_payer(&instructions, Some(&signer.pubkey()), &[signer], blockhash);

  let simulation = rpc.simulate_transaction(&transaction)?;

  if let Some(units_consumed) = simulation.value.units_consumed {
    let temp = (units_consumed as u64 * 115) / 100;
    let compute_unit_limit_with_reserve = temp.min(MAX_CU_LIMIT as u64) as u32;
    Ok(SolanaTransactionSimulation {
      compute_unit_limit: compute_unit_limit_with_reserve,
    })
  } else {
    if failed_attempts >= 3 {
      Err("Simulation failed after 3 attempts".into())
    } else {
      simulate_transaction(
        rpc,
        instructions,
        signer,
        blockhash,
        Some(failed_attempts + 1),
      )
    }
  }
}
