use crate::instructions::{OpenPositionOrca, OpenPositionOrcaInstructionArgs};
use crate::{get_market_address, get_tuna_position_address, WP_NFT_UPDATE_AUTH};
use anyhow::{anyhow, Result};
use orca_whirlpools_client::{fetch_whirlpool, get_position_address};
use solana_client::rpc_client::RpcClient;
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use solana_program::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub fn open_position_orca_instruction(
    rpc: &RpcClient,
    authority: &Pubkey,
    position_mint: &Pubkey,
    whirlpool: &Pubkey,
    args: OpenPositionOrcaInstructionArgs,
) -> Result<Instruction> {
    let whirlpool = fetch_whirlpool(rpc, &whirlpool)?;
    let mint_a_address = whirlpool.data.token_mint_a;
    let mint_b_address = whirlpool.data.token_mint_b;

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let tuna_position_address = get_tuna_position_address(&position_mint).0;
    let market_address = get_market_address(&whirlpool.address).0;

    let ix_builder = OpenPositionOrca {
        authority: *authority,
        mint_a: mint_a_address,
        mint_b: mint_b_address,
        market: market_address,
        tuna_position: tuna_position_address,
        tuna_position_mint: *position_mint,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a_address, &mint_a_account.owner),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b_address, &mint_b_account.owner),
        whirlpool_program: orca_whirlpools_client::ID,
        whirlpool: whirlpool.address,
        orca_position: get_position_address(&position_mint)?.0,
        metadata_update_auth: WP_NFT_UPDATE_AUTH,
        token_program_a: mint_a_account.owner,
        token_program_b: mint_b_account.owner,
        token2022_program: spl_token_2022::ID,
        system_program: system_program::ID,
        associated_token_program: spl_associated_token_account::ID,
    };

    Ok(ix_builder.instruction(args))
}
