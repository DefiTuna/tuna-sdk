use crate::accounts::{TunaConfig, TunaSpotPosition, Vault};
use crate::instructions::{LiquidateTunaSpotPositionOrca, LiquidateTunaSpotPositionOrcaInstructionArgs};
use crate::types::{AccountsType, PoolToken, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::utils::orca::get_swap_tick_arrays;
use crate::{get_market_address, get_tuna_config_address, get_tuna_spot_position_address, get_vault_address, HUNDRED_PERCENT};
use orca_whirlpools_client::{get_oracle_address, Whirlpool};
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

pub fn liquidate_tuna_spot_position_orca_instructions(
    authority: &Pubkey,
    tuna_position: &TunaSpotPosition,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    create_tuna_position_owner_ata: bool,
    withdraw_percent: Option<u32>,
) -> Vec<Instruction> {
    let mut instructions = vec![
        create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_a.mint, token_program_a),
        create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_b.mint, token_program_b),
        liquidate_tuna_spot_position_orca_instruction(
            authority,
            tuna_position,
            tuna_config,
            vault_a,
            vault_b,
            whirlpool,
            token_program_a,
            token_program_b,
            withdraw_percent,
        ),
    ];

    if create_tuna_position_owner_ata {
        if tuna_position.collateral_token == PoolToken::A {
            if tuna_position.mint_a != spl_token::native_mint::ID {
                instructions.insert(
                    0,
                    create_associated_token_account_idempotent(authority, &tuna_position.authority, &tuna_position.mint_a, token_program_a),
                );
            }
        } else {
            if tuna_position.mint_a != spl_token::native_mint::ID {
                instructions.insert(
                    0,
                    create_associated_token_account_idempotent(authority, &tuna_position.authority, &tuna_position.mint_b, token_program_b),
                );
            }
        }
    }

    instructions
}

pub fn liquidate_tuna_spot_position_orca_instruction(
    authority: &Pubkey,
    tuna_position: &TunaSpotPosition,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    withdraw_percent: Option<u32>,
) -> Instruction {
    let mint_a = whirlpool.token_mint_a;
    let mint_b = whirlpool.token_mint_b;
    let tick_spacing = whirlpool.tick_spacing;

    assert_eq!(tuna_position.mint_a, mint_a);
    assert_eq!(tuna_position.mint_b, mint_b);
    assert_eq!(vault_a.mint, mint_a);
    assert_eq!(vault_b.mint, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&tuna_position.pool).0;
    let tuna_position_address = get_tuna_spot_position_address(&tuna_position.authority, &tuna_position.pool).0;
    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&tuna_position.authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&tuna_position.authority, &mint_b, token_program_b);
    let oracle_address = get_oracle_address(&tuna_position.pool).unwrap().0;
    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;

    let swap_ticks_arrays = get_swap_tick_arrays(whirlpool.tick_current_index, tick_spacing, &tuna_position.pool);

    let ix_builder = LiquidateTunaSpotPositionOrca {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a,
        mint_b,
        market: market_address,
        vault_a: vault_a_address,
        vault_b: vault_b_address,
        vault_a_ata: get_associated_token_address_with_program_id(&vault_a_address, &mint_a, token_program_a),
        vault_b_ata: get_associated_token_address_with_program_id(&vault_b_address, &mint_b, token_program_b),
        tuna_position: tuna_position_address,
        tuna_position_owner: tuna_position.authority,
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b, token_program_b),
        tuna_position_owner_ata_a: if tuna_position.collateral_token == PoolToken::A && mint_a != spl_token::native_mint::ID {
            Some(tuna_position_owner_ata_a)
        } else {
            None
        },
        tuna_position_owner_ata_b: if tuna_position.collateral_token == PoolToken::B && mint_b != spl_token::native_mint::ID {
            Some(tuna_position_owner_ata_b)
        } else {
            None
        },
        fee_recipient_ata_a: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_a, token_program_a),
        fee_recipient_ata_b: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_b, token_program_b),
        pyth_oracle_price_feed_a: vault_a.pyth_oracle_price_update,
        pyth_oracle_price_feed_b: vault_b.pyth_oracle_price_update,
        whirlpool_program: orca_whirlpools_client::ID,
        whirlpool: tuna_position.pool,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
        system_program: system_program::ID,
    };

    ix_builder.instruction_with_remaining_accounts(
        LiquidateTunaSpotPositionOrcaInstructionArgs {
            withdraw_percent: withdraw_percent.unwrap_or(HUNDRED_PERCENT),
            remaining_accounts_info: RemainingAccountsInfo {
                slices: vec![
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::SwapTickArrays,
                        length: 5,
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
                        accounts_type: AccountsType::WhirlpoolOracle,
                        length: 1,
                    },
                ],
            },
        },
        &[
            AccountMeta::new(swap_ticks_arrays[0], false),
            AccountMeta::new(swap_ticks_arrays[1], false),
            AccountMeta::new(swap_ticks_arrays[2], false),
            AccountMeta::new(swap_ticks_arrays[3], false),
            AccountMeta::new(swap_ticks_arrays[4], false),
            AccountMeta::new(whirlpool.token_vault_a, false),
            AccountMeta::new(whirlpool.token_vault_b, false),
            AccountMeta::new(oracle_address, false),
        ],
    )
}
