use std::str::FromStr;

use anyhow::{bail, Result};
use defituna_client::{accounts::fetch_tuna_position, collect_fees_orca_instructions, get_tuna_position_address};
use orca_whirlpools_client::{fetch_maybe_whirlpool, MaybeAccount};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signer::Signer};

use crate::{constants::SOL_USDC_WHIRLPOOL, utils::rpc::create_and_send_transaction};

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
pub fn collect_fees(rpc: RpcClient, authority: Box<dyn Signer>, tuna_position_mint: Pubkey) -> Result<()> {
  // The Program Derived Address of the pool from Orca's Whirlpools to create the position in.
  // For this example we use the SOL/USDC Pool.
  let whirlpool_pda = Pubkey::from_str(SOL_USDC_WHIRLPOOL)?;
  // The Whirlpool Account containing deserialized data, fetched using Orca's Whirlpool Client
  let maybe_whirlpool_account = fetch_maybe_whirlpool(&rpc, &whirlpool_pda)?;
  if let MaybeAccount::NotFound(_) = maybe_whirlpool_account {
    bail!("The account was not found for provided address {}", whirlpool_pda);
  };
  let whirlpool_account = match maybe_whirlpool_account {
    MaybeAccount::Exists(data) => data,
    MaybeAccount::NotFound(_) => unreachable!(),
  };

  // Program Derived Addresses and Accounts, fetched from their respective Client (Tuna or Orca);

  // The TunaPosition Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_position_pda, _) = get_tuna_position_address(&tuna_position_mint);
  // The Tuna Position Account containing deserialized data, fetched using Tuna's Client.
  let tuna_position_account = fetch_tuna_position(&rpc, &tuna_position_pda)?;
  // Token Mint A
  let token_mint_a_account = rpc.get_account(&whirlpool_account.data.token_mint_a)?;
  // Token Mint B
  let token_mint_b_account = rpc.get_account(&whirlpool_account.data.token_mint_b)?;

  // Creation of instructions for collecting fees;

  // The CollectFeesOrca instruction builder created via the Tuna Client, handling:
  // - Collecting the fees accrued in the Whirlpool through the Orca Position and transferring them to the user.
  let mut instructions = collect_fees_orca_instructions(
    &authority.pubkey(),
    &tuna_position_account.data,
    &whirlpool_account.data,
    &token_mint_a_account.owner,
    &token_mint_b_account.owner,
  );

  // Signing and sending the transaction with all the instructions to the Solana network.
  create_and_send_transaction(&rpc, &authority, &mut instructions, None, None, None)
}
