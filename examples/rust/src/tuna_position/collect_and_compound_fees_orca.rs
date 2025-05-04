use std::str::FromStr;

use anyhow::{bail, Result};
use defituna_client::{
  accounts::{fetch_market, fetch_tuna_config, fetch_tuna_position, fetch_vault},
  collect_and_compound_fees_orca_instructions, get_market_address, get_tuna_config_address, get_tuna_position_address,
  get_vault_address,
};
use orca_whirlpools_client::{fetch_maybe_whirlpool, MaybeAccount};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signer::Signer};

use crate::{constants::SOL_USDC_WHIRLPOOL, utils::rpc::create_and_send_transaction};

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
pub fn collect_and_compound_fees(rpc: RpcClient, authority: Box<dyn Signer>, tuna_position_mint: Pubkey) -> Result<()> {
  // The Program Derived Address of the pool from Orca's Whirlpools to create the position in.
  // For this example we use the SOL/USDC Pool.
  let whirlpool_pda = Pubkey::from_str(SOL_USDC_WHIRLPOOL)?;
  // The Whirlpool Account containing deserialized data, fetched using Orca's Whirlpool Client.
  let maybe_whirlpool_account = fetch_maybe_whirlpool(&rpc, &whirlpool_pda)?;
  if let MaybeAccount::NotFound(_) = maybe_whirlpool_account {
    bail!("The account was not found for provided address {}", whirlpool_pda);
  };
  let whirlpool_account = match maybe_whirlpool_account {
    MaybeAccount::Exists(data) => data,
    MaybeAccount::NotFound(_) => unreachable!(),
  };

  // Program Derived Addresses and Accounts, fetched from their respective Client (Tuna or Orca);

  // The Tuna Config Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_config_pda, _) = get_tuna_config_address();
  // The Tuna Config Account containing deserialized data, fetched using Tuna's Client.
  let tuna_config_account = fetch_tuna_config(&rpc, &tuna_config_pda)?;
  // The Market Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (market_pda, _) = get_market_address(&whirlpool_pda);
  // The Market Account containing deserialized data, fetched using Tuna's Client.
  let market_account = fetch_market(&rpc, &market_pda)?;
  // The TunaPosition Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_position_pda, _) = get_tuna_position_address(&tuna_position_mint);
  // The Tuna Position Account containing deserialized data, fetched using Tuna's Client.
  let tuna_position_account = fetch_tuna_position(&rpc, &tuna_position_pda)?;
  // The  Vault Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (lending_vault_pda_a, _) = get_vault_address(&whirlpool_account.data.token_mint_a);
  // The Vault Account for token A containing deserialized data, fetched using Tuna's Client.
  let vault_a_account = fetch_vault(&rpc, &lending_vault_pda_a)?;
  // The Vault Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (lending_vault_pda_b, _) = get_vault_address(&whirlpool_account.data.token_mint_b);
  // The Vault Account for token B containing deserialized data, fetched using Tuna's Client.
  let vault_b_account = fetch_vault(&rpc, &lending_vault_pda_b)?;
  // Token Mint A
  let token_mint_a_account = rpc.get_account(&whirlpool_account.data.token_mint_a)?;
  // Token Mint B
  let token_mint_b_account = rpc.get_account(&whirlpool_account.data.token_mint_b)?;

  // Defining input variables;

  // Wheter to maintain the leverage multiplier by borrowing additional tokens from Tuna Lending Vaults to match the compounded fees.
  // For example, with fees of 0.005 Token A and 2.5 Token B and a leverage of 2, an equal amount is borrowed to keep the leverage consistent.
  // true for opting into keeping the leverage multiplier the same, and false otherwise.
  let use_leverage = true;

  // Creation of instructions for collecting and compounding fees;

  // The CollectAndCompoundFeesOrca instruction builder created via the Tuna Client, handling:
  // - Collecting the fees accrued in the Whirlpool through the Orca Position and transferring them back into the Position.
  // - Potentially maintaining the leverage multiplier the same, by borrowing an equal amount of Tokens as the compounded amount, controlled by useLeverage.
  let mut instructions = collect_and_compound_fees_orca_instructions(
    &authority.pubkey(),
    &tuna_config_account.data,
    &tuna_position_account.data,
    &vault_a_account.data,
    &vault_b_account.data,
    &whirlpool_account.data,
    &token_mint_a_account.owner,
    &token_mint_b_account.owner,
    use_leverage,
  );

  // Signing and sending the transaction with all the instructions to the Solana network.
  create_and_send_transaction(
    &rpc,
    &authority,
    &mut instructions,
    None,
    Some(market_account.data.address_lookup_table),
    None,
  )
}
