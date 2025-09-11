use crate::accounts::{fetch_all_vault, fetch_tuna_config, fetch_tuna_lp_position, TunaConfig, TunaLpPosition, Vault};
use crate::instructions::{IncreaseTunaLpPositionOrca, IncreaseTunaLpPositionOrcaInstructionArgs};
use crate::types::{AccountsType, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::utils::get_create_ata_instructions;
use crate::utils::orca::get_swap_tick_arrays;
use crate::{get_market_address, get_tuna_config_address, get_tuna_liquidity_position_address, get_vault_address, IncreaseTunaLpPositionArgs};
use anyhow::{anyhow, Result};
use orca_whirlpools_client::{
    fetch_whirlpool, get_oracle_address, get_position_address, get_tick_array_address, InitializeDynamicTickArray,
    InitializeDynamicTickArrayInstructionArgs, Whirlpool,
};
use orca_whirlpools_core::get_tick_array_start_tick_index;
use solana_client::rpc_client::RpcClient;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

pub fn increase_tuna_lp_position_orca_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    position_mint: &Pubkey,
    args: IncreaseTunaLpPositionArgs,
) -> Result<Vec<Instruction>> {
    let tuna_position = fetch_tuna_lp_position(&rpc, &get_tuna_liquidity_position_address(&position_mint).0)?;

    let whirlpool = fetch_whirlpool(rpc, &tuna_position.data.pool)?;
    let mint_a_address = whirlpool.data.token_mint_a;
    let mint_b_address = whirlpool.data.token_mint_b;

    let tuna_config = fetch_tuna_config(rpc, &get_tuna_config_address().0)?;

    let vaults = fetch_all_vault(&rpc, &[get_vault_address(&mint_a_address).0, get_vault_address(&mint_b_address).0])?;
    let (vault_a, vault_b) = (&vaults[0], &vaults[1]);

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let authority_ata_a_instructions = get_create_ata_instructions(&mint_a_address, authority, authority, &mint_a_account.owner, args.collateral_a);
    let authority_ata_b_instructions = get_create_ata_instructions(&mint_b_address, authority, authority, &mint_b_account.owner, args.collateral_b);

    let mut instructions = vec![];
    instructions.extend(authority_ata_a_instructions.create);
    instructions.extend(authority_ata_b_instructions.create);
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

    let tick_spacing = whirlpool.data.tick_spacing;
    let lower_tick_array_start_index = get_tick_array_start_tick_index(tuna_position.data.tick_lower_index, tick_spacing);
    let upper_tick_array_start_index = get_tick_array_start_tick_index(tuna_position.data.tick_upper_index, tick_spacing);

    let lower_tick_array_address = get_tick_array_address(&whirlpool.address, lower_tick_array_start_index)?.0;
    let upper_tick_array_address = get_tick_array_address(&whirlpool.address, upper_tick_array_start_index)?.0;

    instructions.push(
        InitializeDynamicTickArray {
            whirlpool: whirlpool.address,
            funder: *authority,
            tick_array: lower_tick_array_address,
            system_program: system_program::id(),
        }
        .instruction(InitializeDynamicTickArrayInstructionArgs {
            start_tick_index: lower_tick_array_start_index,
            idempotent: true,
        }),
    );

    instructions.push(
        InitializeDynamicTickArray {
            whirlpool: whirlpool.address,
            funder: *authority,
            tick_array: upper_tick_array_address,
            system_program: system_program::id(),
        }
        .instruction(InitializeDynamicTickArrayInstructionArgs {
            start_tick_index: upper_tick_array_start_index,
            idempotent: true,
        }),
    );

    instructions.push(increase_tuna_lp_position_orca_instruction(
        authority,
        &tuna_position.data,
        &tuna_config.data,
        &vault_a.data,
        &vault_b.data,
        &whirlpool.data,
        &mint_a_account.owner,
        &mint_b_account.owner,
        args,
    ));
    instructions.extend(authority_ata_a_instructions.cleanup);
    instructions.extend(authority_ata_b_instructions.cleanup);

    Ok(instructions)
}

pub fn increase_tuna_lp_position_orca_instruction(
    authority: &Pubkey,
    tuna_position: &TunaLpPosition,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: IncreaseTunaLpPositionArgs,
) -> Instruction {
    let mint_a = whirlpool.token_mint_a;
    let mint_b = whirlpool.token_mint_b;
    let tick_spacing = whirlpool.tick_spacing;

    let whirlpool_address = tuna_position.pool;
    let oracle_address = get_oracle_address(&whirlpool_address).unwrap().0;

    assert_eq!(vault_a.mint, mint_a);
    assert_eq!(vault_b.mint, mint_b);
    assert_eq!(tuna_position.mint_a, mint_a);
    assert_eq!(tuna_position.mint_b, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&whirlpool_address).0;
    let tuna_position_address = get_tuna_liquidity_position_address(&tuna_position.position_mint).0;
    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&authority, &mint_b, token_program_b);
    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&whirlpool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&whirlpool_address, tick_array_upper_start_tick_index).unwrap().0;

    let swap_ticks_arrays = get_swap_tick_arrays(whirlpool.tick_current_index, tick_spacing, &whirlpool_address);

    let ix_builder = IncreaseTunaLpPositionOrca {
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
        tuna_position_owner_ata_a,
        tuna_position_owner_ata_b,
        fee_recipient_ata_a: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_a, token_program_a),
        fee_recipient_ata_b: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_b, token_program_b),
        pyth_oracle_price_feed_a: vault_a.pyth_oracle_price_update,
        pyth_oracle_price_feed_b: vault_b.pyth_oracle_price_update,
        whirlpool_program: orca_whirlpools_client::ID,
        whirlpool: whirlpool_address,
        orca_position: get_position_address(&tuna_position.position_mint).unwrap().0,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
    };

    ix_builder.instruction_with_remaining_accounts(
        IncreaseTunaLpPositionOrcaInstructionArgs {
            collateral_a: args.collateral_a,
            collateral_b: args.collateral_b,
            borrow_a: args.borrow_a,
            borrow_b: args.borrow_b,
            min_added_amount_a: args.min_added_amount_a,
            min_added_amount_b: args.min_added_amount_b,
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
            AccountMeta::new(tick_array_lower_address, false),
            AccountMeta::new(tick_array_upper_address, false),
            AccountMeta::new(whirlpool.token_vault_a, false),
            AccountMeta::new(whirlpool.token_vault_b, false),
            AccountMeta::new(oracle_address, false),
        ],
    )
}
