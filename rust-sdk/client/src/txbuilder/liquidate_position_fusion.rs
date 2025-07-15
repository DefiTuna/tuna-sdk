use crate::accounts::{TunaPosition, Vault};
use crate::instructions::{LiquidatePositionFusion, LiquidatePositionFusionInstructionArgs};
use crate::types::{AccountsType, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::utils::fusion::get_swap_tick_arrays;
use crate::{get_market_address, get_tuna_config_address, get_tuna_position_address, get_vault_address};
use fusionamm_client::{get_position_address, get_tick_array_address, FusionPool};
use fusionamm_core::get_tick_array_start_tick_index;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

/// Position liquidation instructions builder.
/// All accounts must be pre-fetched for this function to speed up the liquidation process.
pub fn liquidate_position_fusion_instructions(
    authority: &Pubkey,
    tuna_position: &TunaPosition,
    vault_a: &Vault,
    vault_b: &Vault,
    fusion_pool: &FusionPool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    withdraw_percent: u32,
) -> Vec<Instruction> {
    vec![
        create_associated_token_account_idempotent(authority, authority, &vault_a.mint, token_program_a),
        create_associated_token_account_idempotent(authority, authority, &vault_b.mint, token_program_b),
        liquidate_position_fusion_instruction(
            authority,
            tuna_position,
            vault_a,
            vault_b,
            fusion_pool,
            token_program_a,
            token_program_b,
            withdraw_percent,
        ),
    ]
}

pub fn liquidate_position_fusion_instruction(
    authority: &Pubkey,
    tuna_position: &TunaPosition,
    vault_a: &Vault,
    vault_b: &Vault,
    fusion_pool: &FusionPool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    withdraw_percent: u32,
) -> Instruction {
    let mint_a = fusion_pool.token_mint_a;
    let mint_b = fusion_pool.token_mint_b;
    let fusion_pool_address = tuna_position.pool;

    assert_eq!(vault_a.mint, mint_a);
    assert_eq!(vault_b.mint, mint_b);
    assert_eq!(tuna_position.mint_a, mint_a);
    assert_eq!(tuna_position.mint_b, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&tuna_position.pool).0;
    let tuna_position_address = get_tuna_position_address(&tuna_position.position_mint).0;
    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, fusion_pool.tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&fusion_pool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, fusion_pool.tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&fusion_pool_address, tick_array_upper_start_tick_index).unwrap().0;

    let swap_ticks_arrays = get_swap_tick_arrays(fusion_pool.tick_current_index, fusion_pool.tick_spacing, &fusion_pool_address);

    let ix_builder = LiquidatePositionFusion {
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
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b, token_program_b),
        liquidation_fee_recipient_ata_a: get_associated_token_address_with_program_id(authority, &mint_a, token_program_a),
        liquidation_fee_recipient_ata_b: get_associated_token_address_with_program_id(authority, &mint_b, token_program_b),
        pyth_oracle_price_feed_a: vault_a.pyth_oracle_price_update,
        pyth_oracle_price_feed_b: vault_b.pyth_oracle_price_update,
        fusionamm_program: fusionamm_client::ID,
        fusion_pool: fusion_pool_address,
        fusion_position: get_position_address(&tuna_position.position_mint).unwrap().0,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
    };

    ix_builder.instruction_with_remaining_accounts(
        LiquidatePositionFusionInstructionArgs {
            withdraw_percent,
            remaining_accounts_info: RemainingAccountsInfo {
                slices: vec![
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::SwapTickArrays,
                        length: 5,
                    },
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
                ],
            },
        },
        &[
            AccountMeta::new(swap_ticks_arrays[0], false),
            AccountMeta::new(swap_ticks_arrays[1], false),
            AccountMeta::new(swap_ticks_arrays[2], false),
            AccountMeta::new(swap_ticks_arrays[3], false),
            AccountMeta::new(swap_ticks_arrays[4], false),
            AccountMeta::new(tick_array_lower_address, false),
            AccountMeta::new(tick_array_upper_address, false),
            AccountMeta::new(fusion_pool.token_vault_a, false),
            AccountMeta::new(fusion_pool.token_vault_b, false),
        ],
    )
}
