use std::str::FromStr;

use anyhow::{bail, Result};
use defituna_client::{
  accounts::{fetch_market, fetch_tuna_position, fetch_vault},
  close_position_orca_instruction, get_market_address, get_tuna_position_address, get_vault_address,
  instructions::RemoveLiquidityOrcaInstructionArgs,
  remove_liquidity_orca_instructions,
  types::TunaPositionState,
};
use orca_whirlpools_client::{fetch_maybe_whirlpool, MaybeAccount};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signer::Signer};

use crate::{constants::SOL_USDC_WHIRLPOOL, types::Amounts, utils::rpc::create_and_send_transaction};

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
pub fn remove_liquidity_and_close(
  rpc: RpcClient,
  authority: Box<dyn Signer>,
  tuna_position_mint: Pubkey,
) -> Result<()> {
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

  // Defining additional input variables;

  // Minimum removed amounts for Tokens A and B to be respected by the RemoveLiquidity instruction, acting as slippage limits.
  let min_removed_amount = Amounts { a: 0, b: 0 };
  // The total amount of slippage allowed on the Whirlpool's price during potential inner swaps due to deposit ratio rebalancing.
  let max_swap_slippage = 0;
  // The option for whether to swap and which token to swap to during RemoveLiquidity.
  // - 0 - No swap
  // - 1 - Swaps to Token A
  // - 2 - Swaps to Token B
  let swap_to_token = 1;
  // The percentage of liquidity in the Orca Position to remove via the RemoveLiquidity instruction.
  // Ranges from 0 (0%) to 1000000 (100%), where each increment of 1 equals 0.0001% (e.g., 250000 = 25%, 5000 = 0.5%, 100000 = 10%).
  // For this example since closing the Position after, set to 1000000 (100%) to remove all liquidity.
  let withdraw_percent = 1_000_000;

  // Creation of instructions for removing liquidity and closing positions;

  let args = RemoveLiquidityOrcaInstructionArgs {
    withdraw_percent,
    swap_to_token,
    min_removed_amount_a: min_removed_amount.a,
    min_removed_amount_b: min_removed_amount.b,
    max_swap_slippage,
  };

  // Checks that position state is `Normal` in order to remove any remaining liquidity from it, otherwise skips removing liquidity.
  // Available states are:
  // - 0: Normal
  // - 1: Liquidated
  // - 2: ClosedByLimitOrder
  let mut instructions = if tuna_position_account.data.state == TunaPositionState::Normal {
    // The RemoveLiquidityOrca instruction created via the Tuna Client, handling:
    // - Withdraws tokens from the Whirlpools vaults to decrease the Position's liquidity.
    // - Repays any potential borrowed funds from *Tuna* Lending Vaults ATAs, proportionally to the withdraw percentage.
    // - Potential swap of tokens if user opts for it, in order to receive all in one token.
    remove_liquidity_orca_instructions(
      &authority.pubkey(),
      &tuna_position_account.data,
      &vault_a_account.data,
      &vault_b_account.data,
      &whirlpool_account.data,
      args,
    )
  } else {
    vec![]
  };

  // The ClosePositionOrca instruction created via the Tuna Client, handling:
  // - Closing the Tuna Position account in the Tuna smart contract.
  // - Closing the Orca Position account via CPI to the Whirlpools smart contract.
  // - Closing Tuna Position ATA accounts and burning of the Position Mint NFT.
  let close_position_orca_ix = close_position_orca_instruction(&authority.pubkey(), &tuna_position_account.data);

  instructions.push(close_position_orca_ix);

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
