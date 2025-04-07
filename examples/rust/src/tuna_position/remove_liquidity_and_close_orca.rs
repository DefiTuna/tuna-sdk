use std::str::FromStr;

use anyhow::{bail, Result};
use orca_whirlpools_client::{
  fetch_maybe_whirlpool, fetch_position as fetch_orca_position, get_oracle_address,
  get_position_address as get_orca_position_address, MaybeAccount, ID as WHIRLPOOL_PROGRAM_ID,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
  instruction::{AccountMeta, Instruction},
  pubkey::Pubkey,
  signer::Signer,
};
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token::ID as TOKEN_PROGRAM_ID;
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;
use tuna_client::{
  accounts::{fetch_market, fetch_tuna_position},
  get_market_address, get_tuna_config_address, get_tuna_position_address, get_vault_address,
  instructions::{ClosePositionOrcaBuilder, RemoveLiquidityOrcaBuilder},
  types::TunaPositionState,
};

use crate::{
  constants::SOL_USDC_WHIRLPOOL,
  types::{ATAInstructions, Amounts},
  utils::{
    common::get_pyth_oracle_price_feed,
    orca::{derive_tick_array_pda, derive_tick_array_pdas_for_swap},
    solana::{create_and_send_transaction, find_or_create_ata, find_or_create_ata_with_auth},
  },
};

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

  // Program Derived Addresses, fetched from their respective Client (Tuna or Orca);

  // The Tuna Config Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_config_pda, _) = get_tuna_config_address();
  // The Market Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (market_pda, _) = get_market_address(&whirlpool_pda);
  // The TunaPosition Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_position_pda, _) = get_tuna_position_address(&tuna_position_mint);
  // The OrcaPosition Program Derived Address, for the Orca Whirlpool, fetched via Orca's Whirlpool Client.
  let (orca_position_pda, _) = get_orca_position_address(&tuna_position_mint)?;
  // The  Vault Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (lending_vault_pda_a, _) = get_vault_address(&whirlpool_account.data.token_mint_a);
  // The Vault Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (lending_vault_pda_b, _) = get_vault_address(&whirlpool_account.data.token_mint_b);
  // The Market Account containing deserialized data, fetched using Tuna's Client.
  let market_account = fetch_market(&rpc, &market_pda)?;

  // Defining Associated Token Addresses (ATAs) and their instructions, where required;

  // The ATA instructions struct containing ATA creation and closure isntructions.
  let ata_instructions = &mut ATAInstructions {
    create_ata_ixs: vec![],
    wsol_ata_ixs: vec![],
    close_wsol_ata_ixs: vec![],
  };
  // The Associated Token Address for the new Position Mint (NFT), owned by the Tuna Position,
  // created with the Token 2022 Program.
  let tuna_position_ata =
    get_associated_token_address_with_program_id(&tuna_position_pda, &tuna_position_mint, &TOKEN_2022_PROGRAM_ID);
  // The Associated Token Address for the Token A, owned by the authority (user), using a function handling WSOL cases.
  let authority_ata_a = find_or_create_ata_with_auth(
    &rpc,
    ata_instructions,
    &authority,
    &whirlpool_account.data.token_mint_a,
    None,
  )?;
  // The Associated Token Address for the Token B, owned by the authority (user), using a function handling WSOL cases.
  let authority_ata_b = find_or_create_ata_with_auth(
    &rpc,
    ata_instructions,
    &authority,
    &whirlpool_account.data.token_mint_b,
    None,
  )?;
  // The Associated Token Address for the Token A, owned by the Tuna Position, acting as an intermediary in the Tuna Smart Contract.
  let tuna_position_ata_a = find_or_create_ata(
    &rpc,
    ata_instructions,
    &authority.pubkey(),
    &whirlpool_account.data.token_mint_a,
    &tuna_position_pda,
    None,
  )?;
  // The Associated Token Address for the Token B, owned by the Tuna Position, acting as an intermediary in the Tuna Smart Contract.
  let tuna_position_ata_b = find_or_create_ata(
    &rpc,
    ata_instructions,
    &authority.pubkey(),
    &whirlpool_account.data.token_mint_b,
    &tuna_position_pda,
    None,
  )?;
  // The Associated Token Address for the Token A, owned by the Lending Vault, for borrowing funds.
  let lending_vault_ata_a = find_or_create_ata(
    &rpc,
    ata_instructions,
    &authority.pubkey(),
    &whirlpool_account.data.token_mint_a,
    &lending_vault_pda_a,
    None,
  )?;
  // The Associated Token Address for the Token B, owned by the Lending Vault, for borrowing funds.
  let lending_vault_ata_b = find_or_create_ata(
    &rpc,
    ata_instructions,
    &authority.pubkey(),
    &whirlpool_account.data.token_mint_b,
    &lending_vault_pda_b,
    None,
  )?;

  // Defining additional accounts and input variables;

  // The on-chain Pyth Oracle account's address for Token A, storing a verified price update from a Pyth price feed.
  // See https://docs.pyth.network/price-feeds for more info.
  let pyth_oracle_price_feed_a = get_pyth_oracle_price_feed(&rpc, &lending_vault_pda_a)?;
  // The on-chain Pyth Oracle account's address for Token B, storing a verified price update from a Pyth price feed.
  // See https://docs.pyth.network/price-feeds for more info.
  let pyth_oracle_price_feed_b = get_pyth_oracle_price_feed(&rpc, &lending_vault_pda_b)?;
  // The Whirlpool Program addressfor Whirlpool-specific operations (opening the Orca Position and adding liquidity).
  let whirlpool_program = WHIRLPOOL_PROGRAM_ID;
  // The Token Program address for handling token transfers in the RemoveLiquidity instruction.
  let token_program = TOKEN_PROGRAM_ID;
  // The Token 2022 Program address for handling burning the Tuna Position Token in the RemoveLiquidity instruction.
  let token_2022_program = TOKEN_2022_PROGRAM_ID;
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

  // The remainingAccounts required for Removing Liquidity instruction;

  // The Orca Position Account containing deserialized data, fetched using Orca's Whirlpool Client.
  let orca_position_account = fetch_orca_position(&rpc, &orca_position_pda)?;
  // The lower Tick index for the Orca Position's range, identifying the lowest Tick at which the Position is active in the Whirlpool.
  // Found in the Orca Position data.
  let tick_lower_index = orca_position_account.data.tick_lower_index;
  // The upper Tick index for the Orca Position's range, identifying the highest Tick at which the Position is active in the Whirlpool.
  // Found in the Orca Position data.
  let tick_upper_index = orca_position_account.data.tick_upper_index;
  // The Tick Array Program Derived Addresses for potential swaps in RemoveLiquidity.
  // Required due to price movements from swaps mutating Whirlpool state, necessitating Tick Arrays.
  // Includes three Tick Arrays above and three below the current price.
  let tick_array_pdas_for_swap = derive_tick_array_pdas_for_swap(&whirlpool_account.data, &whirlpool_pda)?;
  // The Tick Arrays in Account Meta format for accounts passed via remainingAccounts.
  let tick_arrays_for_swap_meta: Vec<AccountMeta> = tick_array_pdas_for_swap
    .into_iter()
    .map(|pubkey| AccountMeta::new(pubkey, false))
    .collect();
  // The Tick Array containing the lower Tick of the Orca Position range
  let tick_array_lower_pda = derive_tick_array_pda(&whirlpool_account.data, &whirlpool_pda, tick_lower_index)?;
  // The Tick Array containing the upper Tick of the Orca Position range
  let tick_array_upper_pda = derive_tick_array_pda(&whirlpool_account.data, &whirlpool_pda, tick_upper_index)?;
  // The Oracle Program Derived Address, for the Orca Whirlpool,
  // fetched via Orca's Whirlpool Client.
  let (oracle_pda, _) = get_oracle_address(&whirlpool_pda)?;
  // The remaining accounts for the RemoveLiquidity instruction in {@link IAccountMeta Account Meta} format.
  // The order of the accounts must be respected.
  let mut remaining_accounts = tick_arrays_for_swap_meta;
  remaining_accounts.push(AccountMeta::new(tick_array_lower_pda, false));
  remaining_accounts.push(AccountMeta::new(tick_array_upper_pda, false));
  remaining_accounts.push(AccountMeta::new(whirlpool_account.data.token_vault_a, false));
  remaining_accounts.push(AccountMeta::new(whirlpool_account.data.token_vault_b, false));
  remaining_accounts.push(AccountMeta::new(oracle_pda, false));
  // The *Tuna Position* Account containing deserialized data, fetched using Tuna's Client.
  let tuna_position_account = fetch_tuna_position(&rpc, &tuna_position_pda)?;

  // Creation of instructions for removing liquidity and closing positions;

  // Checks that position state is `Normal` in order to remove any remaining liquidity from it, otherwise skips removing liquidity.
  // Available states are:
  // - 0: Normal
  // - 1: Liquidated
  // - 2: ClosedByLimitOrder
  let remove_liquidity_orca_instruction = if tuna_position_account.data.state == TunaPositionState::Normal {
    // The RemoveLiquidityOrca instruction builder created via the Tuna Client, handling:
    // - Withdraws tokens from the Whirlpools vaults to decrease the Position's liquidity.
    // - Repays any potential borrowed funds from *Tuna* Lending Vaults ATAs, proportionally to the withdraw percentage.
    // - Potential swap of tokens if user opts for it, in order to receive all in one token.
    let mut remove_liquidity_orca_builder = RemoveLiquidityOrcaBuilder::new();
    remove_liquidity_orca_builder
      .authority(authority.pubkey())
      .tuna_config(tuna_config_pda)
      .market(market_pda)
      .whirlpool(whirlpool_pda)
      .mint_a(whirlpool_account.data.token_mint_a)
      .mint_b(whirlpool_account.data.token_mint_b)
      .vault_a(lending_vault_pda_a)
      .vault_b(lending_vault_pda_b)
      .vault_a_ata(lending_vault_ata_a)
      .vault_b_ata(lending_vault_ata_b)
      .orca_position(orca_position_pda)
      .tuna_position(tuna_position_pda)
      .tuna_position_ata(tuna_position_ata)
      .tuna_position_owner_ata_a(authority_ata_a)
      .tuna_position_owner_ata_b(authority_ata_b)
      .tuna_position_ata_a(tuna_position_ata_a)
      .tuna_position_ata_b(tuna_position_ata_b)
      .swap_to_token(swap_to_token)
      .withdraw_percent(withdraw_percent)
      .min_removed_amount_a(min_removed_amount.a)
      .min_removed_amount_b(min_removed_amount.b)
      .max_swap_slippage(max_swap_slippage)
      .pyth_oracle_price_feed_a(pyth_oracle_price_feed_a)
      .pyth_oracle_price_feed_b(pyth_oracle_price_feed_b)
      .whirlpool_program(whirlpool_program)
      .token_program(token_program);
    // Adding the remainingAccounts to the RemoveLiquidityOrca instruction.
    remove_liquidity_orca_builder.add_remaining_accounts(&remaining_accounts);

    Some(remove_liquidity_orca_builder.instruction())
  } else {
    None
  };

  // The ClosePositionOrca instruction builder created via the Tuna Client, handling:
  // - Closing the Tuna Position account in the Tuna smart contract.
  // - Closing the Orca Position account via CPI to the Whirlpools smart contract.
  // - Closing Tuna Position ATA accounts and burning of the Position Mint NFT.
  let mut close_position_orca_builder = ClosePositionOrcaBuilder::new();
  close_position_orca_builder
    .authority(authority.pubkey())
    .tuna_config(tuna_config_pda)
    .whirlpool(whirlpool_pda)
    .orca_position(orca_position_pda)
    .tuna_position_mint(tuna_position_mint)
    .tuna_position(tuna_position_pda)
    .tuna_position_ata(tuna_position_ata)
    .tuna_position_owner_ata_a(authority_ata_a)
    .tuna_position_owner_ata_b(authority_ata_b)
    .tuna_position_ata_a(tuna_position_ata_a)
    .tuna_position_ata_b(tuna_position_ata_b)
    .whirlpool_program(whirlpool_program)
    .token2022_program(token_2022_program);

  // The instructions array in the proper order for opening positions and adding liquidity.
  let mut instructions_array: Vec<Instruction> = ata_instructions
    .clone()
    .create_ata_ixs
    .into_iter()
    .chain(ata_instructions.wsol_ata_ixs.clone().into_iter())
    .chain(remove_liquidity_orca_instruction.into_iter())
    .chain(std::iter::once(close_position_orca_builder.instruction()))
    .chain(ata_instructions.close_wsol_ata_ixs.clone().into_iter())
    .collect();

  // Signing and sending the transaction with all the instructions to the Solana network.
  create_and_send_transaction(
    &rpc,
    &authority,
    &mut instructions_array,
    None,
    Some(market_account.data.address_lookup_table),
    None,
  )
}
