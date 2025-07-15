use crate::accounts::{fetch_all_vault, fetch_tuna_position, TunaPosition, Vault};
use crate::instructions::{RemoveLiquidityFusion, RemoveLiquidityFusionInstructionArgs};
use crate::types::{AccountsType, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::utils::fusion::get_swap_tick_arrays;
use crate::utils::get_create_ata_instructions;
use crate::{get_market_address, get_tuna_config_address, get_tuna_position_address, get_vault_address, HUNDRED_PERCENT};
use anyhow::{anyhow, Result};
use fusionamm_client::{fetch_fusion_pool, get_position_address, get_tick_array_address, FusionPool};
use fusionamm_core::get_tick_array_start_tick_index;
use solana_client::rpc_client::RpcClient;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub struct RemoveLiquidityFusionArgs {
    pub withdraw_percent: u32,
    pub swap_to_token: u8,
    pub min_removed_amount_a: u64,
    pub min_removed_amount_b: u64,
    pub max_swap_slippage: u32,
}

impl Default for RemoveLiquidityFusionArgs {
    fn default() -> Self {
        Self {
            withdraw_percent: HUNDRED_PERCENT,
            swap_to_token: 0,
            min_removed_amount_a: 0,
            min_removed_amount_b: 0,
            max_swap_slippage: 0,
        }
    }
}

pub fn remove_liquidity_fusion_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    position_mint: &Pubkey,
    args: RemoveLiquidityFusionArgs,
) -> Result<Vec<Instruction>> {
    let tuna_position = fetch_tuna_position(&rpc, &get_tuna_position_address(&position_mint).0)?;

    let fusion_pool = fetch_fusion_pool(rpc, &tuna_position.data.pool)?;
    let mint_a_address = fusion_pool.data.token_mint_a;
    let mint_b_address = fusion_pool.data.token_mint_b;

    let vaults = fetch_all_vault(&rpc, &[get_vault_address(&mint_a_address).0, get_vault_address(&mint_b_address).0])?;
    let (vault_a, vault_b) = (&vaults[0], &vaults[1]);

    let all_mint_addresses = vec![mint_a_address, mint_b_address];
    let mint_accounts = rpc.get_multiple_accounts(all_mint_addresses[0..all_mint_addresses.len()].into())?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let authority_ata_a_instructions = get_create_ata_instructions(&mint_a_address, authority, authority, &mint_a_account.owner, 0);
    let authority_ata_b_instructions = get_create_ata_instructions(&mint_b_address, authority, authority, &mint_b_account.owner, 0);

    let mut instructions = vec![];
    instructions.extend(authority_ata_a_instructions.create);
    instructions.extend(authority_ata_b_instructions.create);

    instructions.push(remove_liquidity_fusion_instruction(
        authority,
        &tuna_position.data,
        &vault_a.data,
        &vault_b.data,
        &fusion_pool.data,
        &mint_a_account.owner,
        &mint_b_account.owner,
        args,
    ));

    instructions.extend(authority_ata_a_instructions.cleanup);
    instructions.extend(authority_ata_b_instructions.cleanup);

    Ok(instructions)
}

pub fn remove_liquidity_fusion_instruction(
    authority: &Pubkey,
    tuna_position: &TunaPosition,
    vault_a: &Vault,
    vault_b: &Vault,
    fusion_pool: &FusionPool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: RemoveLiquidityFusionArgs,
) -> Instruction {
    let mint_a = fusion_pool.token_mint_a;
    let mint_b = fusion_pool.token_mint_b;

    assert_eq!(vault_a.mint, mint_a);
    assert_eq!(vault_b.mint, mint_b);
    assert_eq!(tuna_position.mint_a, mint_a);
    assert_eq!(tuna_position.mint_b, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&tuna_position.pool).0;
    let tuna_position_address = get_tuna_position_address(&tuna_position.position_mint).0;

    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&authority, &mint_b, token_program_b);

    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;
    let fusion_pool_address = tuna_position.pool;

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, fusion_pool.tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&fusion_pool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, fusion_pool.tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&fusion_pool_address, tick_array_upper_start_tick_index).unwrap().0;

    let swap_ticks_arrays = get_swap_tick_arrays(fusion_pool.tick_current_index, fusion_pool.tick_spacing, &fusion_pool_address);

    let ix_builder = RemoveLiquidityFusion {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a: tuna_position.mint_a,
        mint_b: tuna_position.mint_b,
        market: market_address,
        vault_a: vault_a_address,
        vault_b: vault_b_address,
        vault_a_ata: get_associated_token_address_with_program_id(&vault_a_address, &tuna_position.mint_a, token_program_a),
        vault_b_ata: get_associated_token_address_with_program_id(&vault_b_address, &tuna_position.mint_b, token_program_b),
        tuna_position: tuna_position_address,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.mint_b, token_program_b),
        tuna_position_owner_ata_a,
        tuna_position_owner_ata_b,
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
        RemoveLiquidityFusionInstructionArgs {
            withdraw_percent: args.withdraw_percent,
            swap_to_token: args.swap_to_token,
            min_removed_amount_a: args.min_removed_amount_a,
            min_removed_amount_b: args.min_removed_amount_b,
            max_swap_slippage: args.max_swap_slippage,
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
