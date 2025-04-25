use crate::instructions::{OpenPositionOrca, OpenPositionOrcaInstructionArgs};
use crate::{get_market_address, get_tuna_position_address, WP_NFT_UPDATE_AUTH};
use orca_whirlpools_client::{get_position_address, get_whirlpool_address, Whirlpool};
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use solana_program::system_program;
use spl_associated_token_account::{get_associated_token_address, get_associated_token_address_with_program_id};

pub fn open_position_orca_instruction(authority: &Pubkey, position_mint: &Pubkey, whirlpool: &Whirlpool, args: OpenPositionOrcaInstructionArgs) -> Instruction {
    let mint_a = whirlpool.token_mint_a;
    let mint_b = whirlpool.token_mint_b;
    let tick_spacing = whirlpool.tick_spacing;

    let whirlpool_address = get_whirlpool_address(&whirlpool.whirlpools_config, &mint_a, &mint_b, tick_spacing).unwrap().0;

    let tuna_position_address = get_tuna_position_address(&position_mint).0;
    let market_address = get_market_address(&whirlpool_address).0;

    let ix_builder = OpenPositionOrca {
        authority: *authority,
        mint_a,
        mint_b,
        market: market_address,
        tuna_position: tuna_position_address,
        tuna_position_mint: *position_mint,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address(&tuna_position_address, &mint_a),
        tuna_position_ata_b: get_associated_token_address(&tuna_position_address, &mint_b),
        whirlpool_program: orca_whirlpools_client::ID,
        whirlpool: whirlpool_address,
        orca_position: get_position_address(&position_mint).unwrap().0,
        metadata_update_auth: WP_NFT_UPDATE_AUTH,
        token_program: spl_token::ID,
        token2022_program: spl_token_2022::ID,
        system_program: system_program::ID,
        associated_token_program: spl_associated_token_account::ID,
    };

    ix_builder.instruction(args)
}
