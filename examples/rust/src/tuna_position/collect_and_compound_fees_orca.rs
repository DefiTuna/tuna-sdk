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
  accounts::{fetch_market, fetch_tuna_config},
  get_market_address, get_tuna_config_address, get_tuna_position_address, get_vault_address,
  instructions::CollectAndCompoundFeesOrcaBuilder,
};

use crate::{
  constants::SOL_USDC_WHIRLPOOL,
  types::ATAInstructions,
  utils::{
    common::get_pyth_oracle_price_feed,
    orca::{derive_tick_array_pda, derive_tick_array_pdas_for_swap},
    solana::{create_and_send_transaction, find_or_create_ata},
  },
};

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

  // Program Derived Addresses, fetched from their respective Client (Tuna or Orca);

  // The Tuna Config Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_config_pda, _) = get_tuna_config_address();
  // The Market Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (market_pda, _) = get_market_address(&whirlpool_pda);
  // The TunaPosition Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_position_pda, _) = get_tuna_position_address(&tuna_position_mint);
  // The OrcaPosition Program Derived Address, for the Orca Whirlpool, fetched via Orca's Whirlpool Client.
  let (orca_position_pda, _) = get_orca_position_address(&tuna_position_mint)?;
  // The Vault Program Derived Address for Tuna operations, for Token A, fetched from the Tuna Client.
  let (lending_vault_pda_a, _) = get_vault_address(&whirlpool_account.data.token_mint_a);
  // The Vault Program Derived Address for Tuna operations, for Token B, fetched from the Tuna Client.
  let (lending_vault_pda_b, _) = get_vault_address(&whirlpool_account.data.token_mint_b);
  // The Tuna Config Account containing deserialized data, fetched using Tuna's Client.
  let tuna_config_account = fetch_tuna_config(&rpc, &tuna_config_pda)?;
  // The Market Account containing deserialized data, fetched using Tuna's Client.
  let market_account = fetch_market(&rpc, &market_pda)?;

  // Defining Associated Token Addresses (ATAs) and their instructions, where required;

  // The ATA instructions struct containing ATA creation and closure instructions.
  let ata_instructions = &mut ATAInstructions {
    create_ata_ixs: vec![],
    wsol_ata_ixs: vec![],
    close_wsol_ata_ixs: vec![],
  };
  // The Associated Token Address for the new Position Mint (NFT), owned by the Tuna Position,
  // created with the Token 2022 Program.
  let tuna_position_ata =
    get_associated_token_address_with_program_id(&tuna_position_pda, &tuna_position_mint, &TOKEN_2022_PROGRAM_ID);
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
  // The Associated Token Address for the Token A, owned by the Fee Recipient defined in the Tuna Config Account,
  // for receiving protocol fees.
  let fee_recipient_ata_a = find_or_create_ata(
    &rpc,
    ata_instructions,
    &authority.pubkey(),
    &whirlpool_account.data.token_mint_a,
    &tuna_config_account.data.fee_recipient,
    None,
  )?;
  // The Associated Token Address for the Token B, owned by the Fee Recipient defined in the Tuna Config Account,
  // for receiving protocol fees.
  let fee_recipient_ata_b = find_or_create_ata(
    &rpc,
    ata_instructions,
    &authority.pubkey(),
    &whirlpool_account.data.token_mint_b,
    &tuna_config_account.data.fee_recipient,
    None,
  )?;
  // Wheter to maintain the leverage multiplier by borrowing additional tokens from Tuna Lending Vaults to match the compounded fees.
  // For example, with fees of 0.005 Token A and 2.5 Token B and a leverage of 2, an equal amount is borrowed to keep the leverage consistent.
  // true for opting into keeping the leverage multiplier the same, and false otherwise.
  let use_leverage = true;

  // Defining additional accounts and input variables;

  // The on-chain Pyth Oracle account's address for Token A, storing a verified price update from a Pyth price feed.
  // See https://docs.pyth.network/price-feeds for more info.
  let pyth_oracle_price_feed_a = get_pyth_oracle_price_feed(&rpc, &lending_vault_pda_a)?;
  // The on-chain Pyth Oracle account's address for Token B, storing a verified price update from a Pyth price feed.
  // See https://docs.pyth.network/price-feeds for more info.
  let pyth_oracle_price_feed_b = get_pyth_oracle_price_feed(&rpc, &lending_vault_pda_b)?;
  // The Whirlpool Program address for Whirlpool-specific operations (opening the Orca Position and adding liquidity).
  let whirlpool_program = WHIRLPOOL_PROGRAM_ID;
  // The Token Program address for handling token transfers in the AddLiquidity instruction.
  let token_program = TOKEN_PROGRAM_ID;
  // The Orca Position Account containing deserialized data, fetched using Orca's Whirlpool Client.
  let orca_position_account = fetch_orca_position(&rpc, &orca_position_pda)?;

  let tick_lower_index = orca_position_account.data.tick_lower_index;
  // The upper Tick index for the Orca Position's range, identifying the highest Tick at which the Position is active in the Whirlpool.
  // Found in the Orca Position data.
  let tick_upper_index = orca_position_account.data.tick_upper_index;

  // The remainingAccounts required for Removing Liquidity instruction;

  // The Tick Array Program Derived Addresses for potential swaps in CollectAndCompoundFees.
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
  // The remaining accounts for the CollectAndCompoundFees instruction in AccountMeta format.
  // The order of the accounts must be respected.
  let mut remaining_accounts = tick_arrays_for_swap_meta;
  remaining_accounts.push(AccountMeta::new(tick_array_lower_pda, false));
  remaining_accounts.push(AccountMeta::new(tick_array_upper_pda, false));
  remaining_accounts.push(AccountMeta::new(whirlpool_account.data.token_vault_a, false));
  remaining_accounts.push(AccountMeta::new(whirlpool_account.data.token_vault_b, false));
  remaining_accounts.push(AccountMeta::new(oracle_pda, false));

  // Creation of instructions for collecting and compounding fees;

  // The CollectAndCompoundFeesOrca instruction builder created via the Tuna Client, handling:
  // - Collecting the fees accrued in the Whirlpool through the Orca Position and transferring them back into the Position.
  // - Potentially maintaining the leverage multiplier the same, by borrowing an equal amount of Tokens as the compounded amount, controlled by useLeverage.
  let mut collect_and_compound_fees_orca_builder = CollectAndCompoundFeesOrcaBuilder::new();
  collect_and_compound_fees_orca_builder
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
    .tuna_position_ata_a(tuna_position_ata_a)
    .tuna_position_ata_b(tuna_position_ata_b)
    .fee_recipient_ata_a(fee_recipient_ata_a)
    .fee_recipient_ata_b(fee_recipient_ata_b)
    .pyth_oracle_price_feed_a(pyth_oracle_price_feed_a)
    .pyth_oracle_price_feed_b(pyth_oracle_price_feed_b)
    .whirlpool_program(whirlpool_program)
    .token_program(token_program)
    .use_leverage(use_leverage);
  collect_and_compound_fees_orca_builder.add_remaining_accounts(&remaining_accounts);

  // The instructions array in the proper order for opening positions and adding liquidity.
  let mut instructions_array: Vec<Instruction> = ata_instructions
    .clone()
    .create_ata_ixs
    .into_iter()
    .chain(ata_instructions.wsol_ata_ixs.clone().into_iter())
    .chain(std::iter::once(collect_and_compound_fees_orca_builder.instruction()))
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
