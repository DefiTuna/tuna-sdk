use std::str::FromStr;

use anyhow::{bail, Result};
use orca_whirlpools_client::{
  fetch_maybe_whirlpool, fetch_position as fetch_orca_position, get_position_address as get_orca_position_address,
  MaybeAccount, ID as WHIRLPOOL_PROGRAM_ID,
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
use defituna_client::{get_tuna_config_address, get_tuna_position_address, instructions::CollectFeesOrcaBuilder};

use crate::{
  constants::SOL_USDC_WHIRLPOOL,
  types::ATAInstructions,
  utils::{
    orca::derive_tick_array_pda,
    solana::{create_and_send_transaction, find_or_create_ata, find_or_create_ata_with_auth},
  },
};

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

  // Program Derived Addresses, fetched from their respective Client (Tuna or Orca);

  // The Tuna Config Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_config_pda, _) = get_tuna_config_address();
  // The TunaPosition Program Derived Address for Tuna operations, fetched from the Tuna Client.
  let (tuna_position_pda, _) = get_tuna_position_address(&tuna_position_mint);
  // The OrcaPosition Program Derived Address, for the Orca Whirlpool,
  // fetched via Orca's Whirlpol Client.
  let (orca_position_pda, _) = get_orca_position_address(&tuna_position_mint)?;

  // Defining Associated Token Addresses (ATAs) and their instructions, where required;

  // The ATA instructions object containing ATA creation and closure instructions
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

  // Defining additional accounts;

  // The Whirlpool Program address for Whirlpool-specific operations (opening the Orca Position and adding liquidity).
  let whirlpool_program = WHIRLPOOL_PROGRAM_ID;
  // The Token Program address for handling token transfers in the CollectFees instruction.
  let token_program = TOKEN_PROGRAM_ID;

  // The remainingAccounts required for *Removing Liquidity* instruction.

  // The Orca Position Account containing deserialized data, fetched using Orca's Whirlpool Client.
  let orca_position_account = fetch_orca_position(&rpc, &orca_position_pda)?;
  // The lower Tick index for the Position’s range, identifying the lowest Tick at which the Position is active in the Whirlpool.
  // Found in the Orca Position data.
  let tick_lower_index = orca_position_account.data.tick_lower_index;
  // The upper Tick index for the Orca Position's range, identifying the highest Tick at which the Position is active in the Whirlpool.
  // Found in the Orca Position data.
  let tick_upper_index = orca_position_account.data.tick_upper_index;
  // The Tick Array containing the lower Tick of the Orca Position range.
  let tick_array_lower_pda = derive_tick_array_pda(&whirlpool_account.data, &whirlpool_pda, tick_lower_index)?;
  // The Tick Array containing the upper Tick of the Orca Position range.
  let tick_array_upper_pda = derive_tick_array_pda(&whirlpool_account.data, &whirlpool_pda, tick_upper_index)?;
  // The remaining accounts for the CollectFees instruction in AccountMeta format.
  // The order of the accounts must be respected.
  let remaining_accounts: Vec<AccountMeta> = vec![
    AccountMeta::new(tick_array_lower_pda, false),
    AccountMeta::new(tick_array_upper_pda, false),
    AccountMeta::new(whirlpool_account.data.token_vault_a, false),
    AccountMeta::new(whirlpool_account.data.token_vault_b, false),
  ];

  // Creation of instructions for collecting fees;

  // The CollectFeesOrca instruction builder created via the Tuna Client, handling:
  // - Collecting the fees accrued in the Whirlpool through the Orca Position and transferring them to the user.
  let mut collect_fees_orca_builder = CollectFeesOrcaBuilder::new();
  collect_fees_orca_builder
    .authority(authority.pubkey())
    .tuna_config(tuna_config_pda)
    .whirlpool(whirlpool_pda)
    .orca_position(orca_position_pda)
    .tuna_position(tuna_position_pda)
    .tuna_position_ata(tuna_position_ata)
    .tuna_position_ata_a(tuna_position_ata_a)
    .tuna_position_ata_b(tuna_position_ata_b)
    .tuna_position_owner_ata_a(authority_ata_a)
    .tuna_position_owner_ata_b(authority_ata_b)
    .whirlpool_program(whirlpool_program)
    .token_program(token_program);
  // Adding the remainingAccounts to the CollectFeesOrca instruction.
  collect_fees_orca_builder.add_remaining_accounts(&remaining_accounts);

  // The instructions array in the proper order for collecting fees.
  let mut instructions_array: Vec<Instruction> = ata_instructions
    .clone()
    .create_ata_ixs
    .into_iter()
    .chain(ata_instructions.wsol_ata_ixs.clone().into_iter())
    .chain(std::iter::once(collect_fees_orca_builder.instruction()))
    .chain(ata_instructions.close_wsol_ata_ixs.clone().into_iter())
    .collect();

  // Signing and sending the transaction with all the instructions to the Solana network.
  create_and_send_transaction(&rpc, &authority, &mut instructions_array, None, None, None)
}
