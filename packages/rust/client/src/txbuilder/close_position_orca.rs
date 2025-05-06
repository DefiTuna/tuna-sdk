use crate::accounts::TunaPosition;
use crate::get_tuna_position_address;
use crate::instructions::ClosePositionOrca;
use orca_whirlpools_client::get_position_address;
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub fn close_position_orca_instruction(authority: &Pubkey, tuna_position: &TunaPosition, token_program_a: &Pubkey, token_program_b: &Pubkey) -> Instruction {
    let tuna_position_address = get_tuna_position_address(&tuna_position.position_mint).0;

    let ix_builder = ClosePositionOrca {
        authority: *authority,
        mint_a: Default::default(),
        mint_b: Default::default(),
        tuna_position: tuna_position_address,
        tuna_position_mint: tuna_position.position_mint,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.mint_b, token_program_b),
        whirlpool_program: orca_whirlpools_client::ID,
        orca_position: get_position_address(&tuna_position.position_mint).unwrap().0,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        token2022_program: spl_token_2022::ID,
    };

    ix_builder.instruction()
}
