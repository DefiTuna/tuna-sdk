use crate::accounts::{TunaConfig, TunaPosition, Vault};
use crate::instructions::{AddLiquidityOrca, AddLiquidityOrcaInstructionArgs};
use crate::utils::get_create_ata_instructions;
use crate::utils::orca::get_swap_tick_arrays;
use crate::{get_market_address, get_tuna_config_address, get_tuna_position_address, get_vault_address};
use orca_whirlpools_client::{
    get_oracle_address, get_position_address, get_tick_array_address, get_whirlpool_address, InitializeTickArray, InitializeTickArrayInstructionArgs, Whirlpool,
};
use orca_whirlpools_core::get_tick_array_start_tick_index;
use solana_client::rpc_client::RpcClient;
use solana_program::instruction::{AccountMeta, Instruction};
use solana_program::pubkey::Pubkey;
use solana_program::system_program;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_associated_token_account::{get_associated_token_address, get_associated_token_address_with_program_id};

pub fn add_liquidity_orca_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    tuna_position: &TunaPosition,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: AddLiquidityOrcaInstructionArgs,
) -> Vec<Instruction> {
    let mint_a = whirlpool.token_mint_a;
    let mint_b = whirlpool.token_mint_b;
    let tick_spacing = whirlpool.tick_spacing;

    let whirlpool_address = get_whirlpool_address(&whirlpool.whirlpools_config, &mint_a, &mint_b, tick_spacing).unwrap().0;

    let authority_ata_a_instructions = get_create_ata_instructions(&mint_a, authority, authority, token_program_a, args.collateral_a);
    let authority_ata_b_instructions = get_create_ata_instructions(&mint_b, authority, authority, token_program_b, args.collateral_b);

    let mut instructions = vec![];
    instructions.extend(authority_ata_a_instructions.create);
    instructions.extend(authority_ata_b_instructions.create);
    instructions.push(create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &mint_a, token_program_a));
    instructions.push(create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &mint_b, token_program_b));

    let lower_tick_array_start_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, tick_spacing);
    let upper_tick_array_start_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, tick_spacing);

    let lower_tick_array_address = get_tick_array_address(&whirlpool_address, lower_tick_array_start_index).unwrap().0;
    let upper_tick_array_address = get_tick_array_address(&whirlpool_address, upper_tick_array_start_index).unwrap().0;

    let tick_array_infos = rpc
        .get_multiple_accounts(&[lower_tick_array_address.into(), upper_tick_array_address.into()])
        .unwrap();

    if tick_array_infos[0].is_none() {
        instructions.push(
            InitializeTickArray {
                whirlpool: whirlpool_address,
                funder: *authority,
                tick_array: lower_tick_array_address,
                system_program: system_program::id(),
            }
            .instruction(InitializeTickArrayInstructionArgs {
                start_tick_index: lower_tick_array_start_index,
            }),
        );
    }

    if tick_array_infos[1].is_none() && lower_tick_array_start_index != upper_tick_array_start_index {
        instructions.push(
            InitializeTickArray {
                whirlpool: whirlpool_address,
                funder: *authority,
                tick_array: upper_tick_array_address,
                system_program: system_program::id(),
            }
            .instruction(InitializeTickArrayInstructionArgs {
                start_tick_index: upper_tick_array_start_index,
            }),
        );
    }

    instructions.push(add_liquidity_orca_instruction(
        authority,
        tuna_position,
        tuna_config,
        vault_a,
        vault_b,
        whirlpool,
        token_program_a,
        token_program_b,
        args,
    ));
    instructions.extend(authority_ata_a_instructions.cleanup);
    instructions.extend(authority_ata_b_instructions.cleanup);

    instructions
}

pub fn add_liquidity_orca_instruction(
    authority: &Pubkey,
    tuna_position: &TunaPosition,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: AddLiquidityOrcaInstructionArgs,
) -> Instruction {
    let mint_a = whirlpool.token_mint_a;
    let mint_b = whirlpool.token_mint_b;
    let tick_spacing = whirlpool.tick_spacing;

    let whirlpool_address = get_whirlpool_address(&whirlpool.whirlpools_config, &mint_a, &mint_b, tick_spacing).unwrap().0;
    let oracle_address = get_oracle_address(&whirlpool_address).unwrap().0;

    assert_eq!(vault_a.mint, mint_a);
    assert_eq!(vault_b.mint, mint_b);
    assert_eq!(tuna_position.mint_a, mint_a);
    assert_eq!(tuna_position.mint_b, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&whirlpool_address).0;
    let tuna_position_address = get_tuna_position_address(&tuna_position.position_mint).0;
    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&authority, &mint_b, token_program_b);
    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&whirlpool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&whirlpool_address, tick_array_upper_start_tick_index).unwrap().0;

    let swap_ticks_arrays = get_swap_tick_arrays(whirlpool.tick_current_index, tick_spacing, &whirlpool_address);

    let ix_builder = AddLiquidityOrca {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a,
        mint_b,
        market: market_address,
        vault_a: vault_a_address,
        vault_b: vault_b_address,
        vault_a_ata: get_associated_token_address(&vault_a_address, &mint_a),
        vault_b_ata: get_associated_token_address(&vault_b_address, &mint_b),
        tuna_position: tuna_position_address,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address(&tuna_position_address, &mint_a),
        tuna_position_ata_b: get_associated_token_address(&tuna_position_address, &mint_b),
        tuna_position_owner_ata_a,
        tuna_position_owner_ata_b,
        fee_recipient_ata_a: get_associated_token_address(&tuna_config.fee_recipient, &mint_a),
        fee_recipient_ata_b: get_associated_token_address(&tuna_config.fee_recipient, &mint_b),
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
        args,
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
