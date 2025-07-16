use crate::accounts::{fetch_all_vault, fetch_tuna_config, fetch_tuna_position, TunaConfig, TunaPosition, Vault};
use crate::instructions::{RebalancePositionFusion, RebalancePositionFusionInstructionArgs};
use crate::types::{AccountsType, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::utils::fusion::{get_swap_tick_arrays, get_tick_arrays_for_rebalanced_position};
use crate::{get_market_address, get_tuna_config_address, get_tuna_position_address, get_vault_address};
use anyhow::{anyhow, Result};
use fusionamm_client::{
    fetch_fusion_pool, get_position_address, get_tick_array_address, FusionPool, InitializeTickArray, InitializeTickArrayInstructionArgs, TickArray,
};
use fusionamm_core::get_tick_array_start_tick_index;
use solana_client::rpc_client::RpcClient;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use solana_sysvar::rent::Rent;
use solana_sysvar::slot_hashes::SysvarId;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

#[derive(Debug)]
pub struct RebalancePositionInstruction {
    /// A vector of `Instruction` objects required to execute the position re-balancing.
    pub instructions: Vec<Instruction>,

    /// The cost of initializing tick arrays, measured in lamports.
    pub initialization_cost: u64,
}

pub fn rebalance_position_fusion_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    position_mint: &Pubkey,
) -> Result<RebalancePositionInstruction> {
    let rent = rpc.get_account(&Rent::id())?;
    let rent: Rent = bincode::deserialize(&rent.data)?;

    let mut instructions = vec![];
    let mut non_refundable_rent: u64 = 0;

    let tuna_config = fetch_tuna_config(rpc, &get_tuna_config_address().0)?;
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

    let secondary_tick_arrays = get_tick_arrays_for_rebalanced_position(
        fusion_pool.data.tick_current_index,
        fusion_pool.data.tick_spacing,
        &fusion_pool.address,
        tuna_position.data.tick_lower_index,
        tuna_position.data.tick_upper_index,
    );

    let tick_array_infos = rpc.get_multiple_accounts(&[secondary_tick_arrays[0].0, secondary_tick_arrays[1].0])?;

    if tick_array_infos[0].is_none() {
        instructions.push(
            InitializeTickArray {
                fusion_pool: fusion_pool.address,
                funder: *authority,
                tick_array: secondary_tick_arrays[0].0,
                system_program: system_program::id(),
            }
            .instruction(InitializeTickArrayInstructionArgs {
                start_tick_index: secondary_tick_arrays[0].1,
            }),
        );
        non_refundable_rent += rent.minimum_balance(TickArray::LEN);
    }

    if tick_array_infos[1].is_none() && secondary_tick_arrays[0].1 != secondary_tick_arrays[1].1 {
        instructions.push(
            InitializeTickArray {
                fusion_pool: fusion_pool.address,
                funder: *authority,
                tick_array: secondary_tick_arrays[1].0,
                system_program: system_program::id(),
            }
            .instruction(InitializeTickArrayInstructionArgs {
                start_tick_index: secondary_tick_arrays[1].1,
            }),
        );
        non_refundable_rent += rent.minimum_balance(TickArray::LEN);
    }

    instructions.push(create_associated_token_account_idempotent(
        authority,
        &tuna_config.data.fee_recipient,
        &mint_a_address,
        &mint_a_account.owner,
    ));

    instructions.push(create_associated_token_account_idempotent(
        authority,
        &tuna_config.data.fee_recipient,
        &mint_b_address,
        &mint_b_account.owner,
    ));

    instructions.push(rebalance_position_fusion_instruction(
        authority,
        &tuna_position.data,
        &tuna_config.data,
        &vault_a.data,
        &vault_b.data,
        &fusion_pool.data,
        &mint_a_account.owner,
        &mint_b_account.owner,
    ));

    Ok(RebalancePositionInstruction {
        instructions,
        initialization_cost: non_refundable_rent,
    })
}

pub fn rebalance_position_fusion_instruction(
    authority: &Pubkey,
    tuna_position: &TunaPosition,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    fusion_pool: &FusionPool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
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

    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;
    let fusion_pool_address = tuna_position.pool;

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, fusion_pool.tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&fusion_pool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, fusion_pool.tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&fusion_pool_address, tick_array_upper_start_tick_index).unwrap().0;

    let swap_ticks_arrays = get_swap_tick_arrays(fusion_pool.tick_current_index, fusion_pool.tick_spacing, &fusion_pool_address);
    let secondary_tick_arrays = get_tick_arrays_for_rebalanced_position(
        fusion_pool.tick_current_index,
        fusion_pool.tick_spacing,
        &fusion_pool_address,
        tuna_position.tick_lower_index,
        tuna_position.tick_upper_index,
    );

    let ix_builder = RebalancePositionFusion {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a: tuna_position.mint_a,
        mint_b: tuna_position.mint_b,
        market: market_address,
        vault_a: vault_a_address,
        vault_b: vault_b_address,
        tuna_position: tuna_position_address,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.mint_b, token_program_b),
        fee_recipient_ata_a: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_a, token_program_a),
        fee_recipient_ata_b: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_b, token_program_b),
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
        RebalancePositionFusionInstructionArgs {
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
                        accounts_type: AccountsType::SecondaryTickArrayLower,
                        length: 1,
                    },
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::SecondaryTickArrayUpper,
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
            AccountMeta::new(secondary_tick_arrays[0].0, false),
            AccountMeta::new(secondary_tick_arrays[1].0, false),
            AccountMeta::new(fusion_pool.token_vault_a, false),
            AccountMeta::new(fusion_pool.token_vault_b, false),
        ],
    )
}
