use crate::accounts::{fetch_tuna_spot_position, TunaSpotPosition};
use crate::instructions::CloseTunaSpotPosition;
use crate::utils::harvest_withheld_fees_to_mint_instruction;
use crate::{get_market_address, get_tuna_spot_position_address};
use anyhow::{anyhow, Result};
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub fn close_tuna_spot_position_instructions(rpc: &RpcClient, authority: &Pubkey, pool: &Pubkey) -> Result<Vec<Instruction>> {
    let tuna_position_address = get_tuna_spot_position_address(authority, pool).0;
    let tuna_position = fetch_tuna_spot_position(rpc, &tuna_position_address)?;

    let mint_a_address = tuna_position.data.mint_a;
    let mint_b_address = tuna_position.data.mint_b;

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let tuna_position_ata_a = get_associated_token_address_with_program_id(&tuna_position.address, &mint_a_address, &mint_a_account.owner);
    let tuna_position_ata_b = get_associated_token_address_with_program_id(&tuna_position.address, &mint_b_address, &mint_b_account.owner);

    let mut instructions = Vec::with_capacity(3);
    if let Some(instruction) = harvest_withheld_fees_to_mint_instruction(&mint_a_address, mint_a_account, &tuna_position_ata_a)? {
        instructions.push(instruction);
    }
    if let Some(instruction) = harvest_withheld_fees_to_mint_instruction(&mint_b_address, mint_b_account, &tuna_position_ata_b)? {
        instructions.push(instruction);
    }
    instructions.push(close_tuna_spot_position_instruction(
        authority,
        &tuna_position.data,
        &tuna_position.address,
        &mint_a_account.owner,
        &mint_b_account.owner,
    ));

    Ok(instructions)
}

/// Builds only the Tuna close instruction. Callers using this low-level API
/// must harvest withheld fees from fee-bearing position ATAs first.
pub fn close_tuna_spot_position_instruction(
    authority: &Pubkey,
    tuna_position: &TunaSpotPosition,
    tuna_position_address: &Pubkey,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
) -> Instruction {
    let market_address = get_market_address(&tuna_position.pool).0;

    let ix_builder = CloseTunaSpotPosition {
        authority: *authority,
        mint_a: tuna_position.mint_a,
        mint_b: tuna_position.mint_b,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        market: market_address,
        tuna_position: *tuna_position_address,
        tuna_position_ata_a: get_associated_token_address_with_program_id(tuna_position_address, &tuna_position.mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(tuna_position_address, &tuna_position.mint_b, token_program_b),
    };

    ix_builder.instruction()
}
