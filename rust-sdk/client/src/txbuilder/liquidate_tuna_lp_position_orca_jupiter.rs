use crate::accounts::{TunaConfig, TunaLpPosition, Vault};
use crate::instructions::{LiquidateTunaLpPositionOrcaJupiter, LiquidateTunaLpPositionOrcaJupiterInstructionArgs};
use crate::types::{AccountsType, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::{
    get_market_address, get_tuna_config_address, get_tuna_liquidity_position_address, LiquidateTunaLpPositionJupiterArgs, JUPITER_PROGRAM_ID,
};
use orca_whirlpools_client::{get_position_address, get_tick_array_address, Whirlpool};
use orca_whirlpools_core::get_tick_array_start_tick_index;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

/// Position liquidation instructions builder.
/// All accounts must be pre-fetched for this function to speed up the liquidation process.
pub fn liquidate_tuna_lp_position_orca_jupiter_instructions(
    authority: &Pubkey,
    tuna_position: &TunaLpPosition,
    tuna_config: &TunaConfig,
    vault_a_address: &Pubkey,
    vault_a: &Vault,
    vault_b_address: &Pubkey,
    vault_b: &Vault,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    jupiter_route_accounts: Vec<AccountMeta>,
    jupiter_intermediate_token_accounts_and_programs: Vec<AccountMeta>,
    args: LiquidateTunaLpPositionJupiterArgs,
) -> Vec<Instruction> {
    vec![
        create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_a.mint, token_program_a),
        create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_b.mint, token_program_b),
        liquidate_tuna_lp_position_orca_jupiter_instruction(
            authority,
            tuna_position,
            tuna_config,
            vault_a_address,
            vault_a,
            vault_b_address,
            vault_b,
            whirlpool,
            token_program_a,
            token_program_b,
            jupiter_route_accounts,
            jupiter_intermediate_token_accounts_and_programs,
            args,
        ),
    ]
}

pub fn liquidate_tuna_lp_position_orca_jupiter_instruction(
    authority: &Pubkey,
    tuna_position: &TunaLpPosition,
    tuna_config: &TunaConfig,
    vault_a_address: &Pubkey,
    vault_a: &Vault,
    vault_b_address: &Pubkey,
    vault_b: &Vault,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    jupiter_route_accounts: Vec<AccountMeta>,
    jupiter_intermediate_token_accounts_and_programs: Vec<AccountMeta>,
    args: LiquidateTunaLpPositionJupiterArgs,
) -> Instruction {
    let mint_a = whirlpool.token_mint_a;
    let mint_b = whirlpool.token_mint_b;
    let whirlpool_address = tuna_position.pool;

    assert_eq!(vault_a.mint, mint_a);
    assert_eq!(vault_b.mint, mint_b);
    assert_eq!(tuna_position.mint_a, mint_a);
    assert_eq!(tuna_position.mint_b, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&tuna_position.pool).0;
    let tuna_position_address = get_tuna_liquidity_position_address(&tuna_position.position_mint).0;

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, whirlpool.tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&whirlpool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, whirlpool.tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&whirlpool_address, tick_array_upper_start_tick_index).unwrap().0;

    let ix_builder = LiquidateTunaLpPositionOrcaJupiter {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a,
        mint_b,
        market: market_address,
        vault_a: *vault_a_address,
        vault_b: *vault_b_address,
        vault_a_ata: get_associated_token_address_with_program_id(vault_a_address, &mint_a, token_program_a),
        vault_b_ata: get_associated_token_address_with_program_id(vault_b_address, &mint_b, token_program_b),
        tuna_position: tuna_position_address,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b, token_program_b),
        fee_recipient_ata_a: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_a, token_program_a),
        fee_recipient_ata_b: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_b, token_program_b),
        oracle_price_update_a: vault_a.oracle_price_update,
        oracle_price_update_b: vault_b.oracle_price_update,
        whirlpool_program: orca_whirlpools_client::ID,
        whirlpool: whirlpool_address,
        orca_position: get_position_address(&tuna_position.position_mint).unwrap().0,
        jupiter_program: JUPITER_PROGRAM_ID,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
    };

    let mut remaining_accounts_slices = vec![
        RemainingAccountsSlice {
            accounts_type: AccountsType::TickArrayLower,
            length: 1,
        },
        RemainingAccountsSlice {
            accounts_type: AccountsType::TickArrayUpper,
            length: 1,
        },
        RemainingAccountsSlice {
            accounts_type: AccountsType::PoolVaultTokenA,
            length: 1,
        },
        RemainingAccountsSlice {
            accounts_type: AccountsType::PoolVaultTokenB,
            length: 1,
        },
        RemainingAccountsSlice {
            accounts_type: AccountsType::JupiterRoute,
            length: jupiter_route_accounts.len() as u8,
        },
    ];

    if !jupiter_intermediate_token_accounts_and_programs.is_empty() {
        remaining_accounts_slices.push(RemainingAccountsSlice {
            accounts_type: AccountsType::JupiterIntermediateTokenAccounts,
            length: jupiter_intermediate_token_accounts_and_programs.len() as u8,
        });
    }

    let mut remaining_accounts = vec![
        AccountMeta::new(tick_array_lower_address, false),
        AccountMeta::new(tick_array_upper_address, false),
        AccountMeta::new(whirlpool.token_vault_a, false),
        AccountMeta::new(whirlpool.token_vault_b, false),
    ];

    for account in jupiter_route_accounts {
        remaining_accounts.push(account);
    }

    for account in jupiter_intermediate_token_accounts_and_programs {
        remaining_accounts.push(account);
    }

    ix_builder.instruction_with_remaining_accounts(
        LiquidateTunaLpPositionOrcaJupiterInstructionArgs {
            decrease_percent: args.decrease_percent,
            jupiter_route_data: args.jupiter_route_data,
            remaining_accounts_info: RemainingAccountsInfo {
                slices: remaining_accounts_slices,
            },
        },
        &remaining_accounts,
    )
}
