use crate::accounts::{fetch_all_vault, fetch_tuna_spot_position, TunaSpotPosition, Vault};
use crate::instructions::{CloseActiveTunaSpotPositionFusion, CloseActiveTunaSpotPositionFusionInstructionArgs};
use crate::types::{AccountsType, PoolToken, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::utils::fusion::get_swap_tick_arrays;
use crate::utils::get_create_ata_instructions;
use crate::{get_market_address, get_tuna_config_address, get_tuna_spot_position_address, get_vault_address};
use anyhow::{anyhow, Result};
use fusionamm_client::{fetch_fusion_pool, FusionPool};
use solana_client::rpc_client::RpcClient;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub fn close_active_tuna_spot_position_fusion_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    fusion_pool_address: &Pubkey,
    max_swap_amount_in: u64,
) -> Result<Vec<Instruction>> {
    let tuna_position_address = get_tuna_spot_position_address(authority, fusion_pool_address).0;
    let tuna_position = fetch_tuna_spot_position(&rpc, &tuna_position_address)?;

    let fusion_pool = fetch_fusion_pool(rpc, &tuna_position.data.pool)?;
    let mint_a_address = fusion_pool.data.token_mint_a;
    let mint_b_address = fusion_pool.data.token_mint_b;

    let vaults = fetch_all_vault(&rpc, &[get_vault_address(&mint_a_address).0, get_vault_address(&mint_b_address).0])?;
    let (vault_a, vault_b) = (&vaults[0], &vaults[1]);

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let (collateral_token_mint_address, collateral_token_mint_account) = if tuna_position.data.collateral_token == PoolToken::A {
        (mint_a_address, mint_a_account)
    } else {
        (mint_b_address, mint_b_account)
    };
    let authority_ata_instructions =
        get_create_ata_instructions(&collateral_token_mint_address, authority, authority, &collateral_token_mint_account.owner, 0);

    let mut instructions = vec![];
    instructions.extend(authority_ata_instructions.create);

    instructions.push(close_active_tuna_spot_position_fusion_instruction(
        authority,
        &tuna_position.data,
        &vault_a.data,
        &vault_b.data,
        &fusion_pool.address,
        &fusion_pool.data,
        &mint_a_account.owner,
        &mint_b_account.owner,
        max_swap_amount_in,
    ));

    instructions.extend(authority_ata_instructions.cleanup);

    Ok(instructions)
}

pub fn close_active_tuna_spot_position_fusion_instruction(
    authority: &Pubkey,
    tuna_position: &TunaSpotPosition,
    vault_a: &Vault,
    vault_b: &Vault,
    fusion_pool_address: &Pubkey,
    fusion_pool: &FusionPool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    max_swap_amount_in: u64,
) -> Instruction {
    let mint_a = fusion_pool.token_mint_a;
    let mint_b = fusion_pool.token_mint_b;
    let tick_spacing = fusion_pool.tick_spacing;

    assert_eq!(vault_a.mint, mint_a);
    assert_eq!(vault_b.mint, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&fusion_pool_address).0;
    let tuna_position_address = get_tuna_spot_position_address(authority, fusion_pool_address).0;
    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&authority, &mint_b, token_program_b);

    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;

    let swap_ticks_arrays = get_swap_tick_arrays(fusion_pool.tick_current_index, tick_spacing, &fusion_pool_address);

    let ix_builder = CloseActiveTunaSpotPositionFusion {
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
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b, token_program_b),
        tuna_position_owner_ata_a: if tuna_position.collateral_token == PoolToken::A {
            Some(tuna_position_owner_ata_a)
        } else {
            None
        },
        tuna_position_owner_ata_b: if tuna_position.collateral_token == PoolToken::B {
            Some(tuna_position_owner_ata_b)
        } else {
            None
        },
        pyth_oracle_price_feed_a: vault_a.pyth_oracle_price_update,
        pyth_oracle_price_feed_b: vault_b.pyth_oracle_price_update,
        fusionamm_program: fusionamm_client::ID,
        fusion_pool: *fusion_pool_address,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
    };

    ix_builder.instruction_with_remaining_accounts(
        CloseActiveTunaSpotPositionFusionInstructionArgs {
            max_swap_amount_in,
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
                ],
            },
        },
        &[
            AccountMeta::new(swap_ticks_arrays[0], false),
            AccountMeta::new(swap_ticks_arrays[1], false),
            AccountMeta::new(swap_ticks_arrays[2], false),
            AccountMeta::new(swap_ticks_arrays[3], false),
            AccountMeta::new(swap_ticks_arrays[4], false),
            AccountMeta::new(fusion_pool.token_vault_a, false),
            AccountMeta::new(fusion_pool.token_vault_b, false),
        ],
    )
}
