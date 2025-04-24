use crate::accounts::{TunaPosition, Vault};
use crate::instructions::{LiquidatePositionOrca, LiquidatePositionOrcaInstructionArgs};
use crate::utils::orca::get_swap_tick_arrays;
use crate::{get_tuna_config_address, get_tuna_position_address, get_vault_address};
use orca_whirlpools_client::{get_oracle_address, get_position_address, get_tick_array_address, Whirlpool};
use orca_whirlpools_core::get_tick_array_start_tick_index;
use solana_program::instruction::{AccountMeta, Instruction};
use solana_program::pubkey::Pubkey;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_associated_token_account::{get_associated_token_address, get_associated_token_address_with_program_id};

pub fn liquidate_position_orca_instructions(
    authority: &Pubkey,
    market_address: &Pubkey,
    vault_a: &Vault,
    vault_b: &Vault,
    tuna_position: &TunaPosition,
    whirlpool: &Whirlpool,
    withdraw_percent: u32,
) -> Vec<Instruction> {
    vec![
        create_associated_token_account_idempotent(authority, authority, &vault_a.mint, &spl_token::ID),
        create_associated_token_account_idempotent(authority, authority, &vault_b.mint, &spl_token::ID),
        liquidate_position_orca_instruction(authority, market_address, vault_a, vault_b, tuna_position, whirlpool, withdraw_percent),
    ]
}

pub fn liquidate_position_orca_instruction(
    authority: &Pubkey,
    market_address: &Pubkey,
    vault_a: &Vault,
    vault_b: &Vault,
    tuna_position: &TunaPosition,
    whirlpool: &Whirlpool,
    withdraw_percent: u32,
) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let tuna_position_address = get_tuna_position_address(&tuna_position.position_mint).0;

    let vault_a_address = get_vault_address(&tuna_position.mint_a).0;
    let vault_b_address = get_vault_address(&tuna_position.mint_b).0;
    let whirlpool_address = tuna_position.pool;

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, whirlpool.tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&whirlpool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, whirlpool.tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&whirlpool_address, tick_array_upper_start_tick_index).unwrap().0;

    let swap_ticks_arrays = get_swap_tick_arrays(whirlpool.tick_current_index, whirlpool.tick_spacing, &whirlpool_address);

    let ix_builder = LiquidatePositionOrca {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a: tuna_position.mint_a,
        mint_b: tuna_position.mint_b,
        market: *market_address,
        vault_a: vault_a_address,
        vault_b: vault_b_address,
        vault_a_ata: get_associated_token_address(&vault_a_address, &tuna_position.mint_a),
        vault_b_ata: get_associated_token_address(&vault_b_address, &tuna_position.mint_b),
        tuna_position: tuna_position_address,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address(&tuna_position_address, &tuna_position.mint_a),
        tuna_position_ata_b: get_associated_token_address(&tuna_position_address, &tuna_position.mint_b),
        liquidation_fee_recipient_ata_a: get_associated_token_address(authority, &tuna_position.mint_a),
        liquidation_fee_recipient_ata_b: get_associated_token_address(authority, &tuna_position.mint_b),
        pyth_oracle_price_feed_a: vault_a.pyth_oracle_price_update,
        pyth_oracle_price_feed_b: vault_b.pyth_oracle_price_update,
        whirlpool_program: orca_whirlpools_client::ID,
        whirlpool: whirlpool_address,
        orca_position: get_position_address(&tuna_position.position_mint).unwrap().0,
        token_program: spl_token::ID,
    };

    ix_builder.instruction_with_remaining_accounts(
        LiquidatePositionOrcaInstructionArgs { withdraw_percent },
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
            AccountMeta::new(get_oracle_address(&tuna_position.pool).unwrap().0, false),
        ],
    )
}
