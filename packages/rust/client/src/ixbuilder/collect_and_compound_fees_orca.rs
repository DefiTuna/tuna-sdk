use crate::accounts::{TunaConfig, TunaPosition, Vault};
use crate::instructions::{CollectAndCompoundFeesOrca, CollectAndCompoundFeesOrcaInstructionArgs};
use crate::utils::orca::get_swap_tick_arrays;
use crate::{get_market_address, get_tuna_config_address, get_tuna_position_address, get_vault_address};
use orca_whirlpools_client::{get_oracle_address, get_position_address, get_tick_array_address, Whirlpool};
use orca_whirlpools_core::get_tick_array_start_tick_index;
use solana_program::instruction::{AccountMeta, Instruction};
use solana_program::pubkey::Pubkey;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_associated_token_account::{get_associated_token_address, get_associated_token_address_with_program_id};

pub fn collect_and_compound_fees_orca_instructions(
    authority: &Pubkey,
    tuna_config: &TunaConfig,
    tuna_position: &TunaPosition,
    vault_a: &Vault,
    vault_b: &Vault,
    whirlpool: &Whirlpool,
    use_leverage: bool,
) -> Vec<Instruction> {
    vec![
        create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_a.mint, &spl_token::ID),
        create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_b.mint, &spl_token::ID),
        collect_and_compound_fees_orca_instruction(authority, tuna_config, tuna_position, vault_a, vault_b, whirlpool, use_leverage),
    ]
}

pub fn collect_and_compound_fees_orca_instruction(
    authority: &Pubkey,
    tuna_config: &TunaConfig,
    tuna_position: &TunaPosition,
    vault_a: &Vault,
    vault_b: &Vault,
    whirlpool: &Whirlpool,
    use_leverage: bool,
) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&tuna_position.pool).0;
    let tuna_position_address = get_tuna_position_address(&tuna_position.position_mint).0;
    let vault_a_address = get_vault_address(&tuna_position.mint_a).0;
    let vault_b_address = get_vault_address(&tuna_position.mint_b).0;

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, whirlpool.tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&tuna_position.pool, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, whirlpool.tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&tuna_position.pool, tick_array_upper_start_tick_index).unwrap().0;

    let swap_ticks_arrays = get_swap_tick_arrays(whirlpool.tick_current_index, whirlpool.tick_spacing, &tuna_position.pool);

    let ix_builder = CollectAndCompoundFeesOrca {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a: tuna_position.mint_a,
        mint_b: tuna_position.mint_b,
        market: market_address,
        vault_a: vault_a_address,
        vault_b: vault_b_address,
        vault_a_ata: get_associated_token_address(&vault_a_address, &tuna_position.mint_a),
        vault_b_ata: get_associated_token_address(&vault_b_address, &tuna_position.mint_b),
        tuna_position: tuna_position_address,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address(&tuna_position_address, &tuna_position.mint_a),
        tuna_position_ata_b: get_associated_token_address(&tuna_position_address, &tuna_position.mint_b),
        fee_recipient_ata_a: get_associated_token_address(&tuna_config.fee_recipient, &tuna_position.mint_a),
        fee_recipient_ata_b: get_associated_token_address(&tuna_config.fee_recipient, &tuna_position.mint_b),
        pyth_oracle_price_feed_a: vault_a.pyth_oracle_price_update,
        pyth_oracle_price_feed_b: vault_b.pyth_oracle_price_update,
        whirlpool_program: orca_whirlpools_client::ID,
        whirlpool: tuna_position.pool,
        orca_position: get_position_address(&tuna_position.position_mint).unwrap().0,
        token_program: spl_token::ID,
    };

    ix_builder.instruction_with_remaining_accounts(
        CollectAndCompoundFeesOrcaInstructionArgs { use_leverage },
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
