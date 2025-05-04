use crate::accounts::TunaPosition;
use crate::instructions::CollectFeesOrca;
use crate::utils::get_create_ata_instructions;
use crate::{get_tuna_config_address, get_tuna_position_address};
use orca_whirlpools_client::{get_position_address, get_tick_array_address, Whirlpool};
use orca_whirlpools_core::get_tick_array_start_tick_index;
use solana_program::instruction::{AccountMeta, Instruction};
use solana_program::pubkey::Pubkey;
use spl_associated_token_account::{get_associated_token_address, get_associated_token_address_with_program_id};

pub fn collect_fees_orca_instructions(
    authority: &Pubkey,
    tuna_position: &TunaPosition,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
) -> Vec<Instruction> {
    let mint_a = whirlpool.token_mint_a;
    let mint_b = whirlpool.token_mint_b;

    let authority_ata_a_instructions = get_create_ata_instructions(&mint_a, authority, authority, token_program_a, 0);
    let authority_ata_b_instructions = get_create_ata_instructions(&mint_b, authority, authority, token_program_b, 0);

    let mut instructions = vec![];
    instructions.extend(authority_ata_a_instructions.create);
    instructions.extend(authority_ata_b_instructions.create);

    instructions.push(collect_fees_orca_instruction(authority, tuna_position, whirlpool, token_program_a, token_program_b));

    instructions.extend(authority_ata_a_instructions.cleanup);
    instructions.extend(authority_ata_b_instructions.cleanup);

    instructions
}

pub fn collect_fees_orca_instruction(
    authority: &Pubkey,
    tuna_position: &TunaPosition,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
) -> Instruction {
    let mint_a = whirlpool.token_mint_a;
    let mint_b = whirlpool.token_mint_b;
    let whirlpool_address = tuna_position.pool;

    assert_eq!(tuna_position.mint_a, mint_a);
    assert_eq!(tuna_position.mint_b, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let tuna_position_address = get_tuna_position_address(&tuna_position.position_mint).0;
    let tuna_position_owner_ata_a = get_associated_token_address(&authority, &mint_a);
    let tuna_position_owner_ata_b = get_associated_token_address(&authority, &mint_b);

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, whirlpool.tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&whirlpool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, whirlpool.tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&whirlpool_address, tick_array_upper_start_tick_index).unwrap().0;

    let ix_builder = CollectFeesOrca {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a,
        mint_b,
        tuna_position: tuna_position_address,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address(&tuna_position_address, &tuna_position.mint_a),
        tuna_position_ata_b: get_associated_token_address(&tuna_position_address, &tuna_position.mint_b),
        tuna_position_owner_ata_a,
        tuna_position_owner_ata_b,
        whirlpool_program: orca_whirlpools_client::ID,
        whirlpool: whirlpool_address,
        orca_position: get_position_address(&tuna_position.position_mint).unwrap().0,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
    };

    ix_builder.instruction_with_remaining_accounts(&[
        AccountMeta::new(tick_array_lower_address, false),
        AccountMeta::new(tick_array_upper_address, false),
        AccountMeta::new(whirlpool.token_vault_a, false),
        AccountMeta::new(whirlpool.token_vault_b, false),
    ])
}
